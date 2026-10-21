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
import type { ElencoCosti, ElencoCostiRow, ElencoCostiSummaryRow, Project, ProjectItem, UnitCostSource } from '../../common/interfaces/project.interface';

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
const isM = (unit: string): boolean => unit.trim().toLowerCase() === 'm';
const isM2 = (unit: string): boolean => /^(m²|m2|mq)$/i.test(unit.trim());

export function m2Unit(unit: string, L: number | null, H: number | null): number {
  const f = L ?? 0;
  const g = H ?? 0;
  return isM(unit) && g !== 0 ? g / 1000 : (g * f) / 1_000_000;
}

export function m2Total(unit: string, quantity: number, m2u: number): number {
  return isM2(unit) ? quantity : m2u * quantity;
}

/** Equivalent unit labels found in the source workbooks; no quantity conversion is implied. */
export function sameCostUnit(a: string, b: string): boolean {
  const canonical = (unit: string): string => {
    const key = unit.trim().toLowerCase();
    if (['pcs', 'pc', 'pz'].includes(key)) return 'piece';
    if (['m', 'ml'].includes(key)) return 'metre';
    if (['m²', 'm2', 'mq'].includes(key)) return 'square-metre';
    return key;
  };
  return canonical(a) === canonical(b);
}

type CostInputs = Pick<ProjectItem, 'unitCostOverride' | 'historicalUnitCost' | 'unit' | 'historicalUnit'>;

export function unitCostOf(item: CostInputs): { value: number | null; source: UnitCostSource } {
  if (item.unitCostOverride !== null && item.unitCostOverride !== undefined) return { value: round(item.unitCostOverride, 1), source: 'override' };
  if (!item.historicalUnit || !sameCostUnit(item.unit, item.historicalUnit)) return { value: null, source: 'none' };
  if (item.historicalUnitCost !== null && item.historicalUnitCost !== undefined) return { value: round(item.historicalUnitCost, 1), source: 'historical' };
  return { value: null, source: 'none' };
}

export function computeRow(item: ProjectItem, line: number, templateWorkbook: string): ElencoCostiRow {
  const warnings: string[] = [];
  const h = m2Unit(item.unit, item.L, item.H);
  const i = m2Total(item.unit, item.quantity, h);
  const { value: j, source } = unitCostOf(item);
  const k = j === null ? null : j * item.quantity;
  if (!item.catalogId) warnings.push('no reference analysis attached: unit cost unknown until a tab is attached or overridden');
  else if (item.sourceWorkbook && item.sourceWorkbook !== templateWorkbook) warnings.push(`historical unit cost comes from ${item.sourceWorkbook} (different price list than the template)`);
  if (source === 'historical' && item.params.some((p) => p.value !== p.original)) warnings.push('technical parameters changed: the historical unit cost is not recomputed in the web, export to Excel to recalculate');
  if (item.catalogId && (!item.historicalUnit || !sameCostUnit(item.unit, item.historicalUnit))) {
    warnings.push(item.historicalUnit ? `reference cost is per ${item.historicalUnit}, row is ${item.unit}; historical cost cannot be transferred without an explicit override` : 'reference cost unit is unknown; historical cost is unavailable');
  }
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
    tab: item.catalogId ? { id: item.catalogId, workbook: item.sourceWorkbook, sheet: item.sourceSheet, offerNo: item.sourceOfferNo, unit: item.historicalUnit ?? null } : null,
    lotto: item.lotto,
    warnings,
  };
}

export function computeElencoCosti(project: Project): ElencoCosti {
  const rows = project.items.map((it, idx) => computeRow(it, idx + 1, project.templateWorkbook));
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
  const summary = [...byPos.values()]
    .map((s) => ({ ...s, m2Total: s.m2Total, totalCost: s.totalCost, unitCost: s.m2Total !== 0 ? s.totalCost / s.m2Total : null }))
    .sort((a, b) => a.position.localeCompare(b.position));
  return {
    projectId: project.id,
    reference: project.reference,
    rows,
    totals: { m2Total: m2, totalCost: total, rowsWithoutCost: without, complete: without === 0 },
    summary,
    formulas: ELENCO_COSTI_FORMULAS,
    note: 'Unit costs are the historical cached costs of the attached reference analyses (or manual overrides); they are estimated costs, not selling prices, and are not recomputed when parameters change. Export to Excel for a full recalculation.',
  };
}
