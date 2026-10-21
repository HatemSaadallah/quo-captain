/**
 * The ELENCO COSTI sheet, computed in the web with the sheet's own formulas
 * (verified in docs/cell_mapping.md):
 *   H (m² unit)  = IF(AND(D="m",G<>0), G/1000, G*F/1000000)
 *   I (m² total) = IF(D="m²", E, H*E)
 *   J (unit cost)= ROUND('costi parz.'!BE<row>,1)  -> here: the attached reference tab's unit cost
 *                  (costi parz.!BE of its own workbook), or the estimator's override
 *   K (total)    = J*E
 *   I402 = SUM(I), K402 = SUM(K), summary by position = SUMIF(A, pos, I|K), unit = K/I
 *
 * J is a historical cached value: it is NOT recomputed when parameters change.
 * Recomputing an analysis sheet is Excel's job (export + recalculation).
 */
import type { ElencoCosti, ElencoCostiRow, ElencoCostiSummaryRow, Quotation, QuotationItem, UnitCostSource } from '../../common/interfaces/quotation.interface';

export const ELENCO_COSTI_FORMULAS: Record<string, string> = {
  'H (m² unit)': 'IF(AND(D="m",G<>0),G/1000,G*F/1000000)',
  'I (m² total)': 'IF(D="m²",E,H*E)',
  'J (unit cost €)': "ROUND('costi parz.'!$BE<row>,1) — historical value of the attached reference tab, or manual override",
  'K (total cost €)': 'J*E',
  'TOTAL COST': 'SUM(K6:K401)',
  'TOTAL m²': 'SUM(I6:I400)',
  'Summary by position': 'SUMIF($A$6:$A$401,pos,I$6:I$401) / SUMIF(...,K$6:K$401); unit = K/I',
};

const round = (v: number, d: number): number => Math.round(v * 10 ** d) / 10 ** d;
const isM = (unit: string): boolean => /^(m|ml)$/i.test(unit.trim());
const isM2 = (unit: string): boolean => /^(m²|m2|mq)$/i.test(unit.trim());

/** Documented aliases of the measurement units used in ELENCO COSTI (D) and the analysis sheets (T1). */
export function unitClass(unit: string | null | undefined): 'pcs' | 'm' | 'm2' | 'kg' | 'forfait' | 'other' {
  const u = (unit ?? '').trim().toLowerCase();
  if (u === '' || /^(pcs|pz|pc|pezzi|n°|nr|cad)$/.test(u)) return 'pcs';
  if (/^(m|ml)$/.test(u)) return 'm';
  if (/^(m²|m2|mq)$/.test(u)) return 'm2';
  if (u === 'kg') return 'kg';
  if (/^(forfait|a corpo|lump sum)$/.test(u)) return 'forfait';
  return 'other';
}

/** A unit cost is only meaningful when the row's unit and the reference tab's unit are the same class. */
export function unitsCompatible(rowUnit: string, tabUnit: string | null | undefined): boolean {
  return unitClass(rowUnit) === unitClass(tabUnit);
}

export function m2Unit(unit: string, L: number | null, H: number | null): number {
  const f = L ?? 0;
  const g = H ?? 0;
  return isM(unit) && g !== 0 ? g / 1000 : (g * f) / 1_000_000;
}

export function m2Total(unit: string, quantity: number, m2u: number): number {
  return isM2(unit) ? quantity : m2u * quantity;
}

/** Result of the app-side engine for a row (see CostingService). */
export interface ComputedUnitCost {
  unitCost: number | null;
  fidelity: string | null;
  errors: number;
  unsupported: number;
}

export function unitCostOf(item: Pick<QuotationItem, 'unitCostOverride' | 'historicalUnitCost'>, computed?: ComputedUnitCost | null): { value: number | null; source: UnitCostSource } {
  if (item.unitCostOverride !== null && item.unitCostOverride !== undefined) return { value: round(item.unitCostOverride, 1), source: 'override' };
  if (computed && computed.unitCost !== null && computed.unsupported === 0) return { value: round(computed.unitCost, 1), source: 'computed' };
  if (item.historicalUnitCost !== null && item.historicalUnitCost !== undefined) return { value: round(item.historicalUnitCost, 1), source: 'historical' };
  return { value: null, source: 'none' };
}

export function computeRow(item: QuotationItem, line: number, templateWorkbook: string, computed?: ComputedUnitCost | null): ElencoCostiRow {
  const warnings: string[] = [];
  const h = m2Unit(item.unit, item.L, item.H);
  const i = m2Total(item.unit, item.quantity, h);
  const { value: j, source } = unitCostOf(item, computed);
  const k = j === null ? null : j * item.quantity; // K = J*E, no intermediate rounding (SUM(K) in the sheet is unrounded)
  if (!item.catalogId) warnings.push('no reference analysis attached: unit cost unknown until a tab is attached or overridden');
  else if (item.sourceWorkbook && item.sourceWorkbook !== templateWorkbook) warnings.push(`unit cost uses the price list of ${item.sourceWorkbook} (different price list than the template)`);
  if (source === 'computed') {
    if (computed?.fidelity && computed.fidelity !== 'exact') warnings.push(`engine did not reproduce Excel's historical cost for this tab (fidelity: ${computed.fidelity}); review`);
    if (computed?.errors) warnings.push(`${computed.errors} cells evaluate to Excel errors (e.g. codes missing in the price list)`);
  }
  if (source === 'historical' && item.params.some((p) => p.value !== p.original)) warnings.push('technical parameters changed: the historical unit cost is not recomputed (tab logic not stored), export to Excel to recalculate');
  if (source === 'override') warnings.push('manual unit cost');
  if (!(item.quantity > 0)) warnings.push('quantity must be positive');
  return {
    itemId: item.id,
    line,
    position: item.position,
    itemCode: item.itemCode,
    description: item.description,
    unit: item.unit,
    quantity: item.quantity,
    L: item.L,
    H: item.H,
    m2Unit: h,
    m2Total: i,
    unitCost: j,
    totalCost: k,
    unitCostSource: source,
    historicalUnitCost: item.historicalUnitCost,
    unitCostOverride: item.unitCostOverride,
    tab: item.catalogId ? { id: item.catalogId, workbook: item.sourceWorkbook, sheet: item.sourceSheet, offerNo: item.sourceOfferNo } : null,
    lotto: item.lotto,
    warnings,
  };
}

export function computeElencoCosti(quotation: Quotation, computed: Map<string, ComputedUnitCost | null> = new Map()): ElencoCosti {
  const rows = quotation.items.map((it, idx) => computeRow(it, idx + 1, quotation.templateWorkbook, computed.get(it.id)));
  let m2 = 0;
  let total = 0;
  let without = 0;
  const byPos = new Map<string, ElencoCostiSummaryRow>();
  for (const r of rows) {
    m2 += r.m2Total;
    if (r.totalCost === null) without++;
    else total += r.totalCost;
    const key = r.position.trim() || '—';
    const s = byPos.get(key) ?? { position: key, m2Total: 0, totalCost: 0, unitCost: null, rows: 0 };
    s.m2Total += r.m2Total;
    s.totalCost += r.totalCost ?? 0;
    s.rows++;
    byPos.set(key, s);
  }
  // No rounding of sums: the sheet sums unrounded K values; the UI formats to cents.
  const summary = [...byPos.values()]
    .map((s) => ({ ...s, unitCost: s.m2Total !== 0 ? s.totalCost / s.m2Total : null }))
    .sort((a, b) => a.position.localeCompare(b.position));
  return {
    quotationId: quotation.id,
    reference: quotation.reference,
    rows,
    totals: { m2Total: m2, totalCost: total, rowsWithoutCost: without, complete: without === 0 },
    summary,
    formulas: ELENCO_COSTI_FORMULAS,
    note: 'Unit costs marked "computed" are recalculated by the app from the stored logic of the attached reference analysis (its formulas, its workbook price list) with this row\'s quantity and parameters; "historical" ones are the cached Excel values; "override" are manual. All are estimated costs, not selling prices.',
  };
}
