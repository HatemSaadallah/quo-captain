export type CellValue = string | number | boolean | null;

export interface Cell {
  /** Cached value. Errors (#N/A, #REF!, ...) are returned as strings with err=true. */
  v: CellValue;
  /** Formula text without leading '='. Absent for literal input cells. */
  f?: string;
  /** True when the cached value is an Excel error. */
  err?: boolean;
  /** Style index (cellXfs). */
  s?: number;
}

export interface SheetData {
  name: string;
  /** Zip path of the sheet part, e.g. xl/worksheets/sheet3.xml */
  path: string;
  cells: Map<string, Cell>;
  dimension: string | null;
  xml: string;
}

export interface DefinedName {
  name: string;
  ref: string;
  localSheetId?: number;
}

export interface ExternalLink {
  part: string;
  target: string;
}

export interface SheetEntry {
  sheetId: string;
  rId: string;
  state?: string;
}
