/**
 * Evaluates a stored analysis sheet ("reference tab") with the formula engine,
 * without touching the workbook: cells (inputs + formulas) come from the tab's
 * stored cell map, external sheets (DATI GEN. price list, BDG Costi, indiretti,
 * ELENCO COSTI / costi parz. rows) from value snapshots plus the project's own
 * inputs (quantity, description), and the result is the sheet's unit cost (E67)
 * with its category breakdown.
 */
import type { Cell } from '../common/interfaces/xlsx.interface';
import { colToNum, numToCol, splitAddr } from '../common/utils/a1';
import { Evaluator, ExcelError, parseFormula, type EvalContext, type Value } from '../common/utils/formula-engine';
import { ANALYSIS, SHEETS } from './somec-schema';

/** Compact stored form of a sheet: [address, value, formula?]. */
export type StoredCell = [string, Value, string?];

export interface SheetSnapshot {
  /** addr -> value (external sheets store cached values only; formulas optional). */
  cells: Map<string, { v: Value; f?: string }>;
  maxRow: number;
}

export interface EvaluationInputs {
  /** ELENCO COSTI!E<row>: quantity of the item in the project. */
  quantity: number;
  /** ELENCO COSTI!B/C/D/M of the row (item code, description, unit, lotto) seen by the sheet's lookups. */
  itemCode: string;
  description: string;
  unit: string;
  lotto: string | null;
  /** Overrides of literal input cells of the sheet (e.g. N3, N4, T1). */
  overrides: Record<string, Value>;
}

export interface BreakdownLine {
  row: number;
  label: string;
  code: string;
  category: string;
  unit: string | null;
  qty: number | null;
  unitCost: number | null;
  total: number | null;
}

export interface EvaluationResult {
  unitCost: number | null;
  totalCost: number | null;
  unitQuantity: number | null;
  elements: number | null;
  unitWeightKg: number | null;
  breakdown: BreakdownLine[];
  /** Cells whose evaluation produced an Excel error (address -> code). */
  errors: Record<string, string>;
  /** Cells whose formulas could not be parsed/evaluated by the engine (address -> message). */
  unsupported: Record<string, string>;
  evaluatedCells: number;
  ms: number;
}

export function toStoredCells(cells: Map<string, Cell>): StoredCell[] {
  const out: StoredCell[] = [];
  for (const [addr, c] of cells) {
    if (c.v === null && !c.f) continue;
    const v: Value = c.err ? new ExcelError((typeof c.v === 'string' && /^#/.test(c.v) ? c.v : '#VALUE!') as ExcelError['code']) : (c.v as Value);
    out.push(c.f ? [addr, v instanceof ExcelError ? null : v, c.f] : [addr, v instanceof ExcelError ? null : v]);
  }
  return out;
}

export function snapshotFromStored(stored: StoredCell[]): SheetSnapshot {
  const cells = new Map<string, { v: Value; f?: string }>();
  let maxRow = 0;
  for (const [addr, v, f] of stored) {
    cells.set(addr, f ? { v, f } : { v });
    const row = Number(addr.replace(/^[A-Z]+/, ''));
    if (row > maxRow) maxRow = row;
  }
  return { cells, maxRow };
}

/** Rows present per column span, cached per sheet (bounds whole-column ranges). */
class RowIndex {
  private readonly byCol = new Map<number, number[]>();
  private readonly keyIndex = new Map<string, Map<string, number>>();
  constructor(snap: SheetSnapshot) {
    const tmp = new Map<number, Set<number>>();
    for (const addr of snap.cells.keys()) {
      const { col, row } = splitAddr(addr);
      const c = colToNum(col);
      let s = tmp.get(c);
      if (!s) tmp.set(c, (s = new Set()));
      s.add(row);
    }
    for (const [c, s] of tmp) this.byCol.set(c, [...s].sort((a, b) => a - b));
  }
  rows(c1: number, c2: number, r1: number, r2: number): number[] {
    const set = new Set<number>();
    for (let c = c1; c <= Math.min(c2, c1 + 50); c++) for (const r of this.byCol.get(c) ?? []) if (r >= r1 && r <= r2) set.add(r);
    return [...set].sort((a, b) => a - b);
  }
  /** Exact-match index on a column's cached values (external sheets only: values are literal). */
  find(col: number, r1: number, r2: number, key: Value, get: (col: number, row: number) => Value): number | null {
    const k = `${col}:${r1}:${r2}`;
    let idx = this.keyIndex.get(k);
    if (!idx) {
      idx = new Map();
      for (const row of this.rows(col, col, r1, r2)) {
        const v = get(col, row);
        if (v === null || v instanceof ExcelError) continue;
        const kk = typeof v === 'string' ? 's:' + v.toLowerCase() : typeof v === 'number' ? 'n:' + v : 'b:' + v;
        if (!idx.has(kk)) idx.set(kk, row);
      }
      this.keyIndex.set(k, idx);
    }
    const kk = key === null ? 'n:0' : typeof key === 'string' ? 's:' + key.toLowerCase() : typeof key === 'number' ? 'n:' + key : 'b:' + key;
    const hit = idx.get(kk);
    if (hit !== undefined) return hit;
    if (typeof key === 'string' && key.trim() !== '' && Number.isFinite(Number(key))) return idx.get('n:' + Number(key)) ?? null;
    if (typeof key === 'number') return idx.get('s:' + String(key)) ?? null;
    return null;
  }
}

export interface WorkbookSnapshots {
  /** Value snapshots of external sheets by name (DATI GEN., BDG Costi, indiretti, ...). */
  sheets: Map<string, SheetSnapshot>;
  fileName: string;
}

/** The historical inputs of an item row, read from the ELENCO COSTI snapshot (cached values). */
export function inputsForRow(snapshots: WorkbookSnapshots, row: number): EvaluationInputs {
  const ec = snapshots.sheets.get(SHEETS.elencoCosti);
  const val = (col: string): Value => ec?.cells.get(col + row)?.v ?? null;
  const q = val('E');
  return {
    quantity: typeof q === 'number' ? q : 0,
    itemCode: String(val('B') ?? ''),
    description: String(val('C') ?? ''),
    unit: String(val('D') ?? ''),
    lotto: typeof val('M') === 'string' ? (val('M') as string) : null,
    overrides: {},
  };
}

/**
 * Lazy memoised evaluation of one analysis sheet against workbook snapshots.
 * Other analysis sheets referenced by formulas (e.g. '134'!D229) are evaluated the
 * same way when present in `snapshots.sheets`, otherwise they yield #REF!.
 */
export class SheetEvaluator {
  private readonly memo = new Map<string, Value>();
  private readonly busy = new Set<string>();
  private readonly indexes = new Map<string, RowIndex>();
  private readonly subEvaluators = new Map<string, SheetEvaluator>();
  readonly errors: Record<string, string> = {};
  readonly unsupported: Record<string, string> = {};
  private evaluated = 0;

  constructor(
    readonly sheetName: string,
    private readonly snap: SheetSnapshot,
    private readonly snapshots: WorkbookSnapshots,
    private readonly inputs: EvaluationInputs,
    private readonly row: number,
  ) {}

  private index(name: string, snap: SheetSnapshot): RowIndex {
    let i = this.indexes.get(name);
    if (!i) this.indexes.set(name, (i = new RowIndex(snap)));
    return i;
  }

  private projectRowValue(sheet: string, col: string, row: number): Value | undefined {
    if (sheet === SHEETS.elencoCosti && row === this.row) {
      if (col === 'A') return this.inputs.itemCode.split('-')[0] ?? '';
      if (col === 'B') return this.inputs.itemCode;
      if (col === 'C') return this.inputs.description;
      if (col === 'D') return this.inputs.unit;
      if (col === 'E') return this.inputs.quantity;
      if (col === 'M') return this.inputs.lotto;
      return null;
    }
    if (sheet === SHEETS.costiParz && row === this.row) {
      if (col === 'A') return this.row;
      if (col === 'B') return this.inputs.itemCode;
    }
    return undefined;
  }

  private ctxFor(sheet: string): EvalContext {
    return {
      fileName: this.snapshots.fileName,
      sheetName: sheet,
      getCell: (s, col, row) => this.get(s ?? sheet, numToCol(col), row),
      rangeRows: (s, c1, c2, r1, r2) => {
        const name = s ?? sheet;
        if (name === SHEETS.elencoCosti || name === SHEETS.costiParz) {
          // lookups into the item list see only the project's own row
          const snap = this.snapshots.sheets.get(name);
          const rows = new Set<number>([this.row]);
          if (snap) for (const r of this.index(name, snap).rows(c1, c2, r1, r2)) if (r < 6 || r > 400) rows.add(r);
          return [...rows].filter((r) => r >= r1 && r <= r2).sort((a, b) => a - b);
        }
        const snap = name === this.sheetName ? this.snap : this.snapshots.sheets.get(name);
        if (!snap) return [];
        return this.index(name, snap).rows(c1, c2, r1, Math.min(r2, snap.maxRow));
      },
      findRow: (s, col, r1, r2, key) => {
        const name = s ?? sheet;
        if (name === this.sheetName || name === SHEETS.elencoCosti || name === SHEETS.costiParz) return undefined;
        const snap = this.snapshots.sheets.get(name);
        if (!snap) return null;
        return this.index(name, snap).find(col, r1, Math.min(r2, snap.maxRow), key, (c, r) => this.get(name, numToCol(c), r));
      },
    };
  }

  /** Value of any cell of any sheet (memoised). */
  get(sheet: string, col: string, row: number): Value {
    const addr = col + row;
    const override = this.projectRowValue(sheet, col, row);
    if (override !== undefined) return override;
    if (sheet === this.sheetName) {
      if (addr in this.inputs.overrides) return this.inputs.overrides[addr];
      return this.evalOwn(addr);
    }
    const snap = this.snapshots.sheets.get(sheet);
    if (!snap) return new ExcelError('#REF!');
    const cell = snap.cells.get(addr);
    if (!cell) return null;
    if (cell.f && /^\d+$/.test(sheet)) {
      // another analysis sheet: evaluate it with its own formulas and its own ELENCO COSTI row
      let sub = this.subEvaluators.get(sheet);
      if (!sub) {
        sub = new SheetEvaluator(sheet, snap, this.snapshots, inputsForRow(this.snapshots, Number(sheet)), Number(sheet));
        this.subEvaluators.set(sheet, sub);
      }
      return sub.get(sheet, col, row);
    }
    return cell.v;
  }

  private evalOwn(addr: string): Value {
    if (this.memo.has(addr)) return this.memo.get(addr)!;
    const cell = this.snap.cells.get(addr);
    if (!cell) return null;
    if (!cell.f) return cell.v;
    if (this.busy.has(addr)) return new ExcelError('#REF!'); // circular
    this.busy.add(addr);
    let v: Value;
    try {
      v = new Evaluator(this.ctxFor(this.sheetName)).eval(parseFormula(cell.f));
      if (v === null) v = 0; // a formula never yields "blank": a reference to an empty cell is 0
      this.evaluated++;
    } catch (e) {
      this.unsupported[addr] = e instanceof Error ? e.message : String(e);
      v = new ExcelError('#NAME?');
    } finally {
      this.busy.delete(addr);
    }
    if (v instanceof ExcelError) this.errors[addr] = v.code;
    this.memo.set(addr, v);
    return v;
  }

  evaluate(): EvaluationResult {
    const t0 = Date.now();
    const num = (addr: string): number | null => {
      const v = this.get(this.sheetName, splitAddr(addr).col, splitAddr(addr).row);
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    };
    const str = (addr: string): string | null => {
      const v = this.get(this.sheetName, splitAddr(addr).col, splitAddr(addr).row);
      return v === null || v instanceof ExcelError ? null : String(v);
    };
    const breakdown: BreakdownLine[] = [];
    const c = ANALYSIS.summaryCols;
    for (let r = ANALYSIS.summaryFirstRow; r <= ANALYSIS.summaryLastRow; r++) {
      const code = str(c.category + r);
      const label = str(c.label + r);
      if (!code || !label) continue;
      breakdown.push({ row: r, label, code: str(c.code + r) ?? '', category: code, unit: str(c.unit + r), qty: num(c.qty + r), unitCost: num(c.unitCost + r), total: num(c.total + r) });
    }
    const unitCost = num(ANALYSIS.unitCost);
    return {
      unitCost,
      totalCost: num(ANALYSIS.totalCost),
      unitQuantity: num(ANALYSIS.unitQty),
      elements: num(ANALYSIS.qty),
      unitWeightKg: num(ANALYSIS.unitWeight),
      breakdown: breakdown.filter((b) => b.total !== 0),
      errors: { ...this.errors },
      unsupported: { ...this.unsupported },
      evaluatedCells: this.evaluated,
      ms: Date.now() - t0,
    };
  }
}
