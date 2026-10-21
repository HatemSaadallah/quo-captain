/**
 * App-side cost engine: evaluates a stored reference tab (its cells + the workbook
 * snapshots from the database) with the project's inputs, without any Excel file.
 */
import { Injectable, Logger } from '@nestjs/common';
import type { ProjectItem } from '../../common/interfaces/project.interface';
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

@Injectable()
export class CostingService {
  private readonly log = new Logger(CostingService.name);
  private readonly external = new Map<string, Map<string, SheetSnapshot>>(); // workbook -> external sheets
  private readonly tabs = new Map<string, { snap: SheetSnapshot; depends: string[]; fidelity: string | null; row: number }>(); // "wb|sheet"

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
    const r = await this.prisma.referenceTab.findFirst({ where: { workbook, sheet }, select: { cells: true, dependsOnSheets: true, fidelity: true, row: true } });
    if (!r?.cells) return null;
    const t = { snap: snapshotFromStored(r.cells as unknown as StoredCell[]), depends: (r.dependsOnSheets as string[]).filter((d) => d !== '#REF!'), fidelity: r.fidelity, row: r.row };
    this.tabs.set(key, t);
    return t;
  }

  /** True when the workbook's logic is stored (cells + snapshots). */
  async available(workbook: string, sheet: string): Promise<boolean> {
    return (await this.externalSheets(workbook)).size > 0 && (await this.tab(workbook, sheet)) !== null;
  }

  /** Unit cost of the item's reference tab with the item's own quantity, text and parameter overrides. */
  async compute(item: ProjectItem): Promise<ComputedCost | null> {
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
    try {
      const res = new SheetEvaluator(item.sourceSheet, t.snap, snapshots, inputs, t.row).evaluate();
      return { unitCost: res.unitCost, totalCost: res.totalCost, breakdown: res.breakdown, errors: Object.keys(res.errors).length, unsupported: Object.keys(res.unsupported).length, evaluatedCells: res.evaluatedCells, ms: res.ms, fidelity: t.fidelity, workbook: item.sourceWorkbook, sheet: item.sourceSheet };
    } catch (e) {
      this.log.warn(`compute failed for ${item.sourceWorkbook} '${item.sourceSheet}': ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }
}
