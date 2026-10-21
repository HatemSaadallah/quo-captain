export type GenerationEngine = 'ooxml' | 'ooxml+excel';
export type ReportStatus = 'validated' | 'requires_review' | 'failed';
export type CheckLevel = 'ok' | 'warning' | 'error';

export interface CheckResult {
  level: CheckLevel;
  check: string;
  detail: string;
  /** Sheet/cell the check refers to, when applicable. */
  where?: string;
}

export interface GeneratedItemReport {
  itemId: string;
  position: string;
  itemCode: string;
  sourceWorkbook: string;
  sourceSheet: string;
  /** ELENCO COSTI row == new analysis sheet name. */
  row: number;
  sheet: string;
  boqRow: number;
  quantity: number;
  historicalUnitCost: number | null;
  /** From ELENCO COSTI!J<row> after recalculation (null when Excel did not recalculate). */
  unitCost: number | null;
  /** From '<sheet>'!E67 after recalculation. */
  sheetUnitCost: number | null;
  totalCost: number | null;
  /** Price-list codes used by the sheet that do not exist in the template's DATI GEN. */
  missingCodes: string[];
  errorCells: number;
  paramsWritten: Array<{ cell: string; value: number | string | null }>;
  warnings: string[];
}

export interface ExcelStatus {
  available: boolean;
  platform: string;
  detail: string;
}

export interface ValidationReport {
  status: ReportStatus;
  engine: GenerationEngine;
  generatedAt: string;
  quotationId: string;
  reference: string;
  templateWorkbook: string;
  outputFile: string;
  sheetsCopied: string[];
  sheetsModified: string[];
  recalculation: { performed: boolean; method: string; detail: string };
  externalLinks: string[];
  items: GeneratedItemReport[];
  checks: CheckResult[];
  totals: {
    /** ELENCO COSTI!K402 as cached in the file (after recalculation when performed). */
    elencoCostiTotal: number | null;
    /** Σ ELENCO COSTI!K<row> of the generated items. */
    sumOfItems: number | null;
    /** Σ quantity × historical unit cost (indicative). */
    historicalEstimate: number;
  };
  /** True when recalculated and every cart cost reconciles (item J == ROUND(E67,1), K402 == Σ, no error in cart rows, no external input in the cost chain); independent of the workbook-wide status. */
  cartReconciled: boolean;
  errorCellsTotal: number;
  /** Error cells per structural sheet: in the template, in the output, and in the cart's own rows. */
  errorCellsBySheet: SheetErrorCount[];
  summary: string;
  /** sha256 of every source workbook read, proving they were only read. */
  sourceHashes?: Record<string, string>;
}

export interface SheetErrorCount {
  sheet: string;
  template: number;
  output: number;
  cartRows: number;
}

export interface GenerationResult {
  outputFile: string;
  reportFile: string;
  report: ValidationReport;
}
