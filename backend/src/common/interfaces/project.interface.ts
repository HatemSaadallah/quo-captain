export interface ItemParam {
  /** Cell in the analysis sheet, e.g. N3. */
  cell: string;
  label: string;
  unit: string | null;
  value: number | string | null;
  original: number | string | null;
}

/** A cart line: a historical analysis used as a customizable starting template. */
export interface ProjectItem {
  id: string;
  catalogId: string;
  sourceWorkbook: string;
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

export interface Project {
  id: string;
  ownerId: string;
  name: string;
  customer: string;
  /** Offer number: becomes the file name and DATI GEN.!C5 (e.g. TM2099-00). */
  reference: string;
  date: string;
  estimator: string;
  templateWorkbook: string;
  items: ProjectItem[];
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

export interface ProjectValidation {
  ok: boolean;
  issues: ValidationIssue[];
  /** Indicative only: Σ quantity × historical unit cost. Excel is the authority. */
  estimatedTotal: number;
  itemsWithoutCost: number;
}

export interface CreateProjectDto {
  name: string;
  customer?: string;
  reference?: string;
  date?: string;
  estimator?: string;
  templateWorkbook?: string;
}

export type UpdateProjectDto = Partial<Pick<Project, 'name' | 'customer' | 'reference' | 'date' | 'estimator' | 'templateWorkbook'>>;

export interface AddItemDto {
  catalogId: string;
  quantity?: number;
  position?: string;
  itemCode?: string;
  description?: string;
  unit?: string;
  notes?: string;
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
  params?: Array<{ cell: string; value: number | string | null }>;
}
