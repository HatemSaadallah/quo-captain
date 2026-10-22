/**
 * App-side cost engine: evaluates a stored reference tab (its cells + the workbook
 * snapshots from the database) with the quotation's inputs, without any Excel file.
 */
import { Injectable, Logger } from '@nestjs/common';
import type { QuotationItem } from '../../common/interfaces/quotation.interface';
import type { Value } from '../../common/utils/formula-engine';
import { SheetEvaluator, snapshotFromStored, type EvaluationResult, type SheetSnapshot, type StoredCell, type WorkbookSnapshots } from '../../excel/sheet-evaluator';
import { PrismaService } from '../prisma/prisma.service';

export interface ComputedCost {
  unitCost: number | null;
  totalCost: number | null;
  breakdown: EvaluationResult['breakdown'];
  errors: number;
  unsupported: number;
  evaluatedCells: number;
  ms: number;
  /** Fidelity of the engine on this tab with its historical inputs (from extraction). */
  fidelity: string | null;
  workbook: string;
  sheet: string;
}

const TAB_FIELDS = { cells: true, dependsOnSheets: true, fidelity: true, row: true } as const;
const toTab = (r: { cells: unknown; dependsOnSheets: unknown; fidelity: string | null; row: number }) => ({
  snap: snapshotFromStored(r.cells as StoredCell[]),
  depends: (r.dependsOnSheets as string[]).filter((d) => d !== '#REF!'),
  fidelity: r.fidelity,
  row: r.row,
});

@Injectable()
export class CostingService {
  private readonly log = new Logger(CostingService.name);
  private readonly external = new Map<string, Map<string, SheetSnapshot>>(); // workbook -> external sheets
  private readonly tabs = new Map<string, { snap: SheetSnapshot; depends: string[]; fidelity: string | null; row: number }>(); // "wb|sheet"
  // ponytail: in-memory results keyed by every evaluation input, oldest dropped past 5000; a restart clears it (snapshots only change on re-extraction).
  private readonly results = new Map<string, ComputedCost | null>();

  constructor(private readonly prisma: PrismaService) {}

  private async externalSheets(workbook: string): Promise<Map<string, SheetSnapshot>> {
    let m = this.external.get(workbook);
    if (m) return m;
    m = new Map();
    const rows = await this.prisma.workbookSnapshot.findMany({ where: { workbook } });
    for (const r of rows) m.set(r.sheet, snapshotFromStored(r.cells as unknown as StoredCell[]));
    this.external.set(workbook, m);
    return m;
  }

  private async tab(workbook: string, sheet: string): Promise<{ snap: SheetSnapshot; depends: string[]; fidelity: string | null; row: number } | null> {
    const key = `${workbook}|${sheet}`;
    const cached = this.tabs.get(key);
    if (cached) return cached;
    const r = await this.prisma.referenceTab.findFirst({ where: { workbook, sheet }, select: TAB_FIELDS });
    if (!r?.cells) return null;
    this.tabs.set(key, toTab(r));
    return this.tabs.get(key)!;
  }

  /** Loads every reference tab the lines need (and the sheets those depend on) in one query per pass, not one per line. */
  async prefetch(items: QuotationItem[]): Promise<void> {
    let wanted = items.filter((it) => it.sourceWorkbook && it.sourceSheet).map((it) => ({ workbook: it.sourceWorkbook!, sheet: it.sourceSheet! }));
    for (let pass = 0; pass < 2; pass++) {
      const missing = [...new Map(wanted.filter((w) => !this.tabs.has(`${w.workbook}|${w.sheet}`)).map((w) => [`${w.workbook}|${w.sheet}`, w])).values()];
      if (!missing.length) return;
      const rows = await this.prisma.referenceTab.findMany({ where: { OR: missing }, select: { workbook: true, sheet: true, ...TAB_FIELDS } });
      for (const r of rows) if (r.cells && r.sheet && !this.tabs.has(`${r.workbook}|${r.sheet}`)) this.tabs.set(`${r.workbook}|${r.sheet}`, toTab(r));
      wanted = rows.flatMap((r) => (r.dependsOnSheets as string[]).filter((d) => d !== '#REF!').map((sheet) => ({ workbook: r.workbook, sheet })));
    }
  }

  /** True when the workbook's logic is stored (cells + snapshots). */
  async available(workbook: string, sheet: string): Promise<boolean> {
    return (await this.externalSheets(workbook)).size > 0 && (await this.tab(workbook, sheet)) !== null;
  }

  private async evaluatorFor(item: QuotationItem): Promise<{ ev: SheetEvaluator; snap: SheetSnapshot; fidelity: string | null } | null> {
    if (!item.sourceWorkbook || !item.sourceSheet) return null;
    const ext = await this.externalSheets(item.sourceWorkbook);
    const t = await this.tab(item.sourceWorkbook, item.sourceSheet);
    if (!ext.size || !t) return null;
    const sheets = new Map(ext);
    sheets.set(item.sourceSheet, t.snap);
    for (const dep of t.depends) {
      const d = await this.tab(item.sourceWorkbook, dep);
      if (d) sheets.set(dep, d.snap);
    }
    const snapshots: WorkbookSnapshots = { sheets, fileName: item.sourceWorkbook };
    const overrides: Record<string, Value> = {};
    for (const p of item.params) if (p.value !== null && p.value !== undefined) overrides[p.cell] = p.value;
    const inputs = { quantity: item.quantity, itemCode: item.itemCode, description: item.description, unit: item.unit, lotto: item.lotto, overrides };
    return { ev: new SheetEvaluator(item.sourceSheet, t.snap, snapshots, inputs, t.row), snap: t.snap, fidelity: t.fidelity };
  }

  /** Unit cost of the item's reference tab with the item's own quantity, text and parameter overrides. */
  async compute(item: QuotationItem): Promise<ComputedCost | null> {
    const key = JSON.stringify([item.sourceWorkbook, item.sourceSheet, item.quantity, item.itemCode, item.description, item.unit, item.lotto, item.params.map((p) => [p.cell, p.value])]);
    if (this.results.has(key)) return this.results.get(key)!;
    const result = await this.evaluate(item);
    this.results.set(key, result);
    if (this.results.size > 5000) this.results.delete(this.results.keys().next().value!);
    return result;
  }

  private async evaluate(item: QuotationItem): Promise<ComputedCost | null> {
    const e = await this.evaluatorFor(item);
    if (!e) return null;
    try {
      const res = e.ev.evaluate();
      return { unitCost: res.unitCost, totalCost: res.totalCost, breakdown: res.breakdown, errors: Object.keys(res.errors).length, unsupported: Object.keys(res.unsupported).length, evaluatedCells: res.evaluatedCells, ms: res.ms, fidelity: e.fidelity, workbook: item.sourceWorkbook!, sheet: item.sourceSheet! };
    } catch (err) {
      this.log.warn(`compute failed for ${item.sourceWorkbook} '${item.sourceSheet}': ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /**
   * The evaluated analysis sheet as a grid for the web workbook view: every stored cell up to
   * column W (the sheet's print area) with its computed value and formula.
   */
  async grid(item: QuotationItem): Promise<{ cells: Array<{ addr: string; v: Value; f?: string }>; maxRow: number } | null> {
    const e = await this.evaluatorFor(item);
    if (!e) return null;
    const cells: Array<{ addr: string; v: Value; f?: string }> = [];
    let maxRow = 0;
    for (const [addr, c] of e.snap.cells) {
      const m = /^([A-Z]+)(\d+)$/.exec(addr);
      if (!m || m[1].length > 1 || m[1] > 'W') continue;
      const row = Number(m[2]);
      const v = e.ev.get(item.sourceSheet!, m[1], row);
      if (v === null && !c.f) continue;
      cells.push(c.f ? { addr, v, f: c.f } : { addr, v });
      if (row > maxRow) maxRow = row;
    }
    return { cells, maxRow };
  }
}
