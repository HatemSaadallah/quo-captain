/** The generated quotation rendered as a clickable web workbook (no Excel file). */

export type GridCellKind = 'input' | 'formula' | 'label' | 'header' | 'total';

export interface GridCell {
  /** A1 address in the sheet. */
  addr: string;
  v: number | string | boolean | null;
  /** Formula text (without '=') when the cell is computed. */
  f?: string;
  kind: GridCellKind;
  /** Error code when the evaluation produced an Excel error. */
  err?: string;
  /** For editable inputs: which project field the cell maps to. */
  edit?: { itemId: string; field: 'quantity' | 'unitCostOverride' | 'param' | 'position' | 'itemCode' | 'description' | 'unit' | 'L' | 'H'; cell?: string };
  /** Where the value comes from (source workbook/sheet/cell or 'project'). */
  source?: string;
}

export interface GridSheet {
  name: string;
  kind: 'elenco' | 'analysis';
  /** Project item behind an analysis sheet. */
  itemId?: string;
  title?: string;
  cols: string[];
  rows: number[];
  cells: GridCell[];
  /** Column widths in characters (approximate, for the web grid). */
  widths?: Record<string, number>;
  note?: string;
}

export interface WorkbookView {
  projectId: string;
  reference: string;
  generatedAt: string;
  sheets: GridSheet[];
}

export interface BenchmarkExample {
  id: string;
  title: string | null;
  offerNo: string | null;
  workbook: string;
  sheet: string | null;
  client: string | null;
  projectDate: string | null;
  itemCode: string | null;
  unit: string | null;
  quantity: number | null;
  L: number | null;
  H: number | null;
  unitCost: number | null;
  params: Array<{ label: string; value: number | string | null; unit: string | null }>;
  similarity: number;
  sourceCell: string | null;
}

export interface BenchmarkCategoryRow {
  category: string;
  code: string;
  /** Unit cost of this category in the row's own tab (computed or historical). */
  own: number | null;
  /** Unit cost of the same category in each comparable tab (same order as `examples`). */
  comparables: Array<number | null>;
}

export interface Benchmark {
  itemId: string;
  query: string;
  examples: BenchmarkExample[];
  categories: BenchmarkCategoryRow[];
  /** Historical projects (workbooks) ranked by how many comparable tabs they contribute. */
  projects: Array<{ workbook: string; offerNo: string | null; client: string | null; projectName: string | null; projectDate: string | null; matches: number }>;
  stats: { min: number | null; median: number | null; max: number | null; own: number | null; unit: string | null };
}
