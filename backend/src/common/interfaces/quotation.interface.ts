export interface ItemParam {
  /** Cell in the analysis sheet, e.g. N3. */
  cell: string;
  label: string;
  unit: string | null;
  value: number | string | null;
  original: number | string | null;
}

/**
 * A cost row (= one ELENCO COSTI line). Either attached to a historical analysis
 * ("reference tab", catalogId set) used as a customizable template, or a free row
 * typed from the customer's BOQ that still needs a reference tab attached.
 */
export interface QuotationItem {
  id: string;
  catalogId: string | null;
  referenceTabId: string | null;
  sourceWorkbook: string | null;
  sourceSheet: string | null;
  sourceOfferNo: string | null;
  position: string;
  itemCode: string;
  description: string;
  unit: string;
  quantity: number;
  L: number | null;
  H: number | null;
  lotto: string | null;
  /** Editable technical parameters (literal inputs in the source sheet). */
  params: ItemParam[];
  historicalUnitCost: number | null;
  historicalQuantity: number | null;
  /** Manual unit cost replacing the historical one in the web ELENCO COSTI. */
  unitCostOverride: number | null;
  dependsOnSheets: string[];
  notes: string;
}

export interface GenerationSummary {
  at: string;
  file: string;
  reportFile: string;
  status: string;
  engine: string;
}

export type QuotationStatus = 'draft' | 'active';

export interface Quotation {
  id: string;
  ownerId: string;
  projectId: string;
  projectName: string;
  name: string;
  customer: string;
  /** Offer number: becomes the file name and DATI GEN.!C5 (e.g. TM2099-00). */
  reference: string;
  date: string;
  estimator: string;
  templateWorkbook: string;
  /** draft = cart being built; active = confirmed. */
  status: QuotationStatus;
  items: QuotationItem[];
  createdAt: string;
  updatedAt: string;
  generations: GenerationSummary[];
}

export type IssueLevel = 'error' | 'warning';

export interface ValidationIssue {
  level: IssueLevel;
  itemId?: string;
  message: string;
}

export interface QuotationValidation {
  ok: boolean;
  issues: ValidationIssue[];
  /** Indicative only: Σ quantity × unit cost (override or historical). Excel is the authority. */
  estimatedTotal: number;
  itemsWithoutCost: number;
}

export interface CreateQuotationDto {
  name: string;
  projectId: string;
  reference: string;
  date: string;
  estimator: string;
  templateWorkbook: string;
  status?: QuotationStatus;
}

export type UpdateQuotationDto = Partial<Pick<Quotation, 'name' | 'projectId' | 'reference' | 'date' | 'estimator' | 'templateWorkbook' | 'status'>>;

export interface AddItemDto {
  catalogId: string;
  quantity?: number;
  position?: string;
  itemCode?: string;
  description?: string;
  unit?: string;
  notes?: string;
}

/** A free ELENCO COSTI row typed from the BOQ, without a reference tab. */
export interface AddRowDto {
  position?: string;
  itemCode?: string;
  description: string;
  unit?: string;
  quantity: number;
  L?: number | null;
  H?: number | null;
  lotto?: string | null;
}

export interface AttachTabDto {
  /** Catalog / reference tab id, e.g. TM1643-06#10. */
  referenceTabId: string;
  /** Replace description, unit and dimensions of the row with the tab's values (default: only fill blanks). */
  overwrite?: boolean;
}

export interface UpdateItemDto {
  position?: string;
  itemCode?: string;
  description?: string;
  unit?: string;
  notes?: string;
  quantity?: number;
  L?: number | null;
  H?: number | null;
  lotto?: string | null;
  unitCostOverride?: number | null;
  params?: Array<{ cell: string; value: number | string | null }>;
}

export type UnitCostSource = 'override' | 'computed' | 'historical' | 'none';

/** One computed line of the web ELENCO COSTI (columns as in the sheet). */
export interface ElencoCostiRow {
  itemId: string;
  /** 1-based line number in the web table. */
  line: number;
  position: string;
  itemCode: string;
  description: string;
  unit: string;
  /** E */
  quantity: number;
  /** F (mm) */
  L: number | null;
  /** G (mm) */
  H: number | null;
  /** H = IF(AND(D="m",G<>0),G/1000,G*F/1000000) */
  m2Unit: number;
  /** I = IF(D="m²",E,H*E) */
  m2Total: number;
  /** J = ROUND('costi parz.'!BE,1): the attached tab's unit cost (or the manual override) */
  unitCost: number | null;
  /** K = J*E */
  totalCost: number | null;
  unitCostSource: UnitCostSource;
  historicalUnitCost: number | null;
  unitCostOverride: number | null;
  /** "Detail sheet ref.": the attached reference tab. */
  tab: { id: string; workbook: string | null; sheet: string | null; offerNo: string | null } | null;
  lotto: string | null;
  warnings: string[];
}

export interface ElencoCostiSummaryRow {
  position: string;
  m2Total: number;
  totalCost: number;
  /** K/I when I ≠ 0 (as the sheet's summary block). */
  unitCost: number | null;
  rows: number;
}

export interface ElencoCosti {
  quotationId: string;
  reference: string;
  rows: ElencoCostiRow[];
  totals: {
    /** I402 = SUM(I6:I400) */
    m2Total: number;
    /** K402 = SUM(K6:K401) over rows that have a unit cost */
    totalCost: number;
    rowsWithoutCost: number;
    complete: boolean;
  };
  /** A406.. = SUMIF by position */
  summary: ElencoCostiSummaryRow[];
  formulas: Record<string, string>;
  note: string;
}
