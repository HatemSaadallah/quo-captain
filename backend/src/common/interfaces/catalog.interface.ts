export interface CatalogParam {
  /** Cell in the analysis sheet holding the value, e.g. N3. */
  cell: string;
  label: string;
  unit: string | null;
  value: number | string | null;
  /** Editable means the cell is a literal input (no formula) in the source sheet. */
  editable: boolean;
  formula?: string;
}

export interface CostBreakdownRow {
  category: string;
  code: string;
  unit: string | null;
  qty: number | null;
  unitCost: number | null;
  total: number | null;
}

/** One historical product analysis: an ELENCO COSTI row plus its analysis sheet. */
export interface CatalogRecord {
  id: string;
  workbook: string;
  offerNo: string | null;
  client: string | null;
  projectName: string | null;
  estimator: string | null;
  projectDate: string | null;
  row: number;
  sheet: string | null;
  position: string | null;
  categoryName: string | null;
  itemCode: string | null;
  title: string | null;
  description: string | null;
  unit: string | null;
  quantity: number | null;
  L: number | null;
  H: number | null;
  m2Unit: number | null;
  unitCost: number | null;
  totalCost: number | null;
  lotto: string | null;
  analysisUnit: string | null;
  productClass: string | null;
  sheetUnitCost: number | null;
  sheetTotalCost: number | null;
  unitWeightKg: number | null;
  params: CatalogParam[];
  costBreakdown: CostBreakdownRow[];
  lineItemCount: number;
  codesUsed: string[];
  errorCells: number;
  dependsOnSheets: string[];
  hasExternalRefs: boolean;
  sourceCells: Record<string, string>;
  warnings: string[];
  searchText: string;
}

export interface WorkbookSummary {
  workbook: string;
  offerNo: string | null;
  client: string | null;
  projectName: string | null;
  estimator: string | null;
  projectDate: string | null;
  country: string | null;
  sheetCount: number;
  analysisSheetCount: number;
  itemCount: number;
  totalCost: number | null;
  externalLinks: string[];
  calcPr: Record<string, string>;
  /** ELENCO COSTI rows 6..400 with no item and no sheet of that number: where new items can go. */
  freeItemRows: number;
  requiredSheetsPresent: boolean;
}

export interface Catalog {
  generatedAt: string;
  workbooks: WorkbookSummary[];
  records: CatalogRecord[];
}

export interface EmbeddingIndex {
  model: string;
  dim: number;
  ids: string[];
  vectors: number[][];
  /** sha256 of model + embedded texts; see embeddingFingerprint(). */
  fingerprint?: string;
}

export interface SearchHit {
  record: CatalogRecord;
  score: number;
  semanticScore: number | null;
  lexicalScore: number;
  matchedTokens: string[];
}

export interface SearchOptions {
  q?: string;
  workbook?: string;
  category?: string;
  limit?: number;
  /** true = lexical only (deterministic, no model). */
  noSemantic?: boolean;
}

export type EmbeddingStatus = 'missing' | 'building' | 'ready' | 'failed';

export interface SearchResult {
  hits: SearchHit[];
  /** true when the query was ranked with embeddings; false = lexical only (index not ready or disabled). */
  semantic: boolean;
  embeddingStatus: EmbeddingStatus;
}

export interface FacetCount {
  name: string;
  count: number;
}

export interface CatalogFacets {
  generatedAt: string;
  recordCount: number;
  embeddings: { status: EmbeddingStatus; model: string; error: string | null };
  workbooks: WorkbookSummary[];
  categories: FacetCount[];
  units: FacetCount[];
}
