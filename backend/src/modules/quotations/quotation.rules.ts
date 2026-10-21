/** Pure business rules for quotations (the cart / web ELENCO COSTI). No I/O. */
import type { CatalogRecord, WorkbookSummary } from '../../common/interfaces/catalog.interface';
import type { AddRowDto, ItemParam, Quotation, QuotationItem, QuotationValidation, ValidationIssue } from '../../common/interfaces/quotation.interface';
import { SHEETS } from '../../excel/somec-schema';
import { unitCostOf, unitsCompatible } from './elenco-costi';

export type NewItem = Omit<QuotationItem, 'id'>;

export function itemFromCatalog(r: CatalogRecord, quantity: number, overrides: Partial<NewItem> = {}): NewItem {
  const params: ItemParam[] = r.params
    .filter((p) => p.editable)
    .map((p) => ({ cell: p.cell, label: p.label, unit: p.unit, value: p.value, original: p.value }));
  return {
    catalogId: r.id,
    referenceTabId: null,
    sourceWorkbook: r.workbook,
    sourceSheet: r.sheet,
    sourceOfferNo: r.offerNo,
    position: r.position ?? '',
    itemCode: r.itemCode ?? '',
    description: r.description ?? '',
    unit: r.unit ?? 'Pcs',
    quantity,
    L: r.L,
    H: r.H,
    lotto: r.lotto,
    params,
    historicalUnitCost: r.unitCost,
    historicalQuantity: r.quantity,
    unitCostOverride: null,
    dependsOnSheets: r.dependsOnSheets,
    notes: '',
    ...overrides,
  };
}

/** A free ELENCO COSTI row typed from the customer's BOQ; a reference tab is attached later. */
export function blankRow(input: AddRowDto): NewItem {
  return {
    catalogId: null,
    referenceTabId: null,
    sourceWorkbook: null,
    sourceSheet: null,
    sourceOfferNo: null,
    position: input.position?.trim() ?? '',
    itemCode: input.itemCode?.trim() ?? '',
    description: input.description.trim(),
    unit: input.unit?.trim() || 'Pcs',
    quantity: input.quantity,
    L: input.L ?? null,
    H: input.H ?? null,
    lotto: input.lotto ?? null,
    params: [],
    historicalUnitCost: null,
    historicalQuantity: null,
    unitCostOverride: null,
    dependsOnSheets: [],
    notes: '',
  };
}

/** Attach a reference tab to a row: provenance, historical cost and parameters come from the tab; the row keeps its own text unless `overwrite`. */
export function attachTab(row: QuotationItem, tab: CatalogRecord, overwrite: boolean): NewItem {
  const fromTab = itemFromCatalog(tab, row.quantity);
  const keep = (own: string, tabValue: string): string => (overwrite || !own.trim() ? tabValue : own);
  return {
    ...fromTab,
    position: keep(row.position, fromTab.position),
    itemCode: keep(row.itemCode, fromTab.itemCode),
    description: keep(row.description, fromTab.description),
    unit: keep(row.unit, fromTab.unit),
    L: overwrite || row.L === null ? fromTab.L : row.L,
    H: overwrite || row.H === null ? fromTab.H : row.H,
    lotto: overwrite || row.lotto === null ? fromTab.lotto : row.lotto,
    unitCostOverride: row.unitCostOverride,
    notes: row.notes,
  };
}

const REFERENCE_RE = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,40}$/;

export function isValidReference(ref: string): boolean {
  return REFERENCE_RE.test(ref) && !/\.xls/i.test(ref);
}

export function validateQuotation(p: Quotation, template: WorkbookSummary | null, tabUnitOf?: (catalogId: string) => string | null | undefined): QuotationValidation {
  const issues: ValidationIssue[] = [];
  const push = (level: ValidationIssue['level'], message: string, itemId?: string): void => {
    issues.push(itemId ? { level, itemId, message } : { level, message });
  };
  if (!p.name?.trim()) push('error', 'Quotation name is required');
  if (!p.reference?.trim()) push('error', 'Reference number is required (it becomes the offer number and file name)');
  else if (!isValidReference(p.reference)) push('error', 'Reference may only contain letters, digits, spaces, "-", "_" and "."');
  if (!p.customer?.trim()) push('error', 'Customer is required');
  if (!p.date || Number.isNaN(Date.parse(p.date))) push('error', 'Date is missing or invalid');
  if (!p.templateWorkbook) push('error', 'No template workbook selected');
  else if (!template) push('error', `Template workbook ${p.templateWorkbook} is not in the catalog`);
  else {
    if (!template.requiredSheetsPresent) push('error', `Template ${p.templateWorkbook} lacks one of the required sheets (${SHEETS.elencoCosti}, ${SHEETS.costiParz}, ...)`);
    if (p.items.length > template.freeItemRows) push('error', `Template has only ${template.freeItemRows} free item rows; the cart has ${p.items.length}`);
  }
  if (!p.items.length) push('error', 'The cart is empty: add at least one cost row');

  const seen = new Map<string, string>();
  let estimatedTotal = 0;
  let itemsWithoutCost = 0;
  for (const it of p.items) {
    const tag = `${it.position || '?'} / ${it.itemCode || '?'}`;
    if (!it.catalogId) push('error', `${tag}: no reference analysis attached (attach one by similarity); the Excel export needs a sheet to copy`, it.id);
    else if (!it.sourceSheet) push('error', `${tag}: the historical row has no analysis sheet, nothing can be copied`, it.id);
    if (!(it.quantity > 0) || !Number.isFinite(it.quantity)) push('error', `${tag}: quantity must be a positive number`, it.id);
    if (!it.itemCode.trim()) push('error', `${tag}: item code is required`, it.id);
    if (!it.position.trim()) push('warning', `${tag}: position is empty (summary by position will not group it)`, it.id);
    if (!it.description.trim()) push('error', `${tag}: description is required`, it.id);
    if (!it.unit.trim()) push('error', `${tag}: unit is required`, it.id);
    const dup = seen.get(it.itemCode);
    if (dup) push('warning', `${tag}: duplicate item code (also used by ${dup})`, it.id);
    seen.set(it.itemCode, tag);
    for (const prm of it.params) {
      if (prm.unit === 'MM' && (typeof prm.value !== 'number' || !(prm.value > 0))) push('error', `${tag}: parameter "${prm.label}" must be a positive number of mm`, it.id);
    }
    if (it.dependsOnSheets.some((s) => s !== '#REF!') && it.sourceWorkbook !== p.templateWorkbook) {
      push('error', `${tag}: analysis sheet references other sheets (${it.dependsOnSheets.join(', ')}) and comes from a different workbook than the template; incompatible configuration`, it.id);
    } else if (it.dependsOnSheets.includes('#REF!')) {
      push('warning', `${tag}: analysis sheet contains broken #REF! references in the source workbook`, it.id);
    } else if (it.dependsOnSheets.length) {
      push('warning', `${tag}: analysis sheet references sheets ${it.dependsOnSheets.join(', ')}; they are not copied, review the result`, it.id);
    }
    if (it.sourceWorkbook && it.sourceWorkbook !== p.templateWorkbook) {
      push('warning', `${tag}: copied from ${it.sourceWorkbook}; price-list codes are looked up in the template's DATI GEN., costs will differ from the historical value`, it.id);
    }
    if (it.unitCostOverride !== null && it.unitCostOverride !== undefined) push('warning', `${tag}: manual unit cost ${it.unitCostOverride} overrides the historical value in the web ELENCO COSTI (not in the Excel export)`, it.id);
    if (it.catalogId && tabUnitOf && !unitsCompatible(it.unit, tabUnitOf(it.catalogId))) push('error', `${tag}: row unit "${it.unit}" is incompatible with the reference tab's unit "${tabUnitOf(it.catalogId) ?? '?'}"`, it.id);
    const { value } = unitCostOf(it);
    if (value === null || value === 0) {
      itemsWithoutCost++;
      push('warning', `${tag}: no unit cost (no reference tab attached and no override)`, it.id);
    } else if (it.quantity > 0) estimatedTotal += it.quantity * value;
  }
  return { ok: !issues.some((i) => i.level === 'error'), issues, estimatedTotal: Math.round(estimatedTotal * 100) / 100, itemsWithoutCost };
}
