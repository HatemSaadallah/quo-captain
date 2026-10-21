import { describe, it, expect } from 'vitest';
import type { Project, ProjectItem } from '../../common/interfaces/project.interface';
import { computeElencoCosti, m2Total, m2Unit } from './elenco-costi';

function item(over: Partial<ProjectItem>): ProjectItem {
  return {
    id: 'i',
    catalogId: 'TM1643-06#10',
    referenceTabId: null,
    sourceWorkbook: 'TM1643-06 Analisi.xlsx',
    sourceSheet: '10',
    sourceOfferNo: 'TM1643-06',
    position: '01',
    itemCode: '01-01',
    description: 'PRE-FAB BALCONY Type 1',
    unit: 'Pcs',
    quantity: 712,
    L: 2560,
    H: 1600,
    lotto: null,
    params: [],
    historicalUnitCost: 1090.7,
    historicalQuantity: 712,
    unitCostOverride: null,
    dependsOnSheets: [],
    notes: '',
    ...over,
  };
}

const project = (items: ProjectItem[]): Project => ({ id: 'p', ownerId: 'u', name: 'n', customer: 'c', reference: 'TM2099-00', date: '2026-10-21', estimator: 'e', templateWorkbook: 'TM1643-06 Analisi.xlsx', items, createdAt: '', updatedAt: '', generations: [] });

describe('ELENCO COSTI formulas (same as the sheet, verified on TM1643-06 rows 10, 30 and 45)', () => {
  it('row 10: pieces, 2560x1600 -> 4.096 m² unit, 2916.352 m² total, 1090.7 x 712 = 776578.4', () => {
    const ec = computeElencoCosti(project([item({})]));
    const r = ec.rows[0];
    expect(r.m2Unit).toBe(4.096);
    expect(r.m2Total).toBeCloseTo(2916.352, 6);
    expect(r.unitCost).toBe(1090.7);
    expect(r.totalCost).toBe(776578.4);
    expect(r.unitCostSource).toBe('historical');
    expect(ec.totals.totalCost).toBe(776578.4);
    expect(ec.totals.complete).toBe(true);
  });

  it('row 30: unit m² -> I = quantity, no dimensions', () => {
    expect(m2Unit('m²', null, null)).toBe(0);
    expect(m2Total('m²', 4901, 0)).toBe(4901);
    const r = computeElencoCosti(project([item({ id: 'f', unit: 'm²', quantity: 4901, L: null, H: null, historicalUnitCost: 122.8, position: '03', itemCode: '03-01' })])).rows[0];
    expect(r.m2Total).toBe(4901);
    expect(r.totalCost).toBeCloseTo(601842.8, 2);
  });

  it('unit m with a height uses G/1000 (as ELENCO COSTI!H)', () => {
    expect(m2Unit('m', 2560, 1128)).toBe(1.128);
    expect(m2Unit('Pcs', 2560, 1128)).toBeCloseTo(2.88768, 6);
  });

  it('free rows have no unit cost until a tab or an override is set; overrides win', () => {
    const free = item({ id: 'free', catalogId: null, sourceWorkbook: null, sourceSheet: null, sourceOfferNo: null, historicalUnitCost: null, historicalQuantity: null, quantity: 10 });
    const ec = computeElencoCosti(project([item({}), free]));
    expect(ec.rows[1].unitCost).toBeNull();
    expect(ec.rows[1].totalCost).toBeNull();
    expect(ec.rows[1].warnings[0]).toMatch(/no reference analysis attached/);
    expect(ec.totals.rowsWithoutCost).toBe(1);
    expect(ec.totals.complete).toBe(false);
    const withOverride = computeElencoCosti(project([item({ ...free, unitCostOverride: 999.96 })]));
    expect(withOverride.rows[0].unitCost).toBe(1000); // ROUND(,1)
    expect(withOverride.rows[0].unitCostSource).toBe('override');
    expect(withOverride.rows[0].totalCost).toBe(10000);
  });

  it('sums by position like the SUMMARY block', () => {
    const ec = computeElencoCosti(project([item({}), item({ id: 'b', itemCode: '01-02', quantity: 129, L: 2710, historicalUnitCost: 1128.6 }), item({ id: 'c', position: '03', itemCode: '03-01', unit: 'm²', quantity: 4901, L: null, H: null, historicalUnitCost: 122.8 })]));
    const s01 = ec.summary.find((s) => s.position === '01')!;
    expect(s01.rows).toBe(2);
    expect(s01.totalCost).toBeCloseTo(776578.4 + 145589.4, 2);
    expect(s01.m2Total).toBeCloseTo(2916.352 + 559.344, 3);
    expect(s01.unitCost).toBeCloseTo(s01.totalCost / s01.m2Total, 2);
    expect(ec.summary.map((s) => s.position)).toEqual(['01', '03']);
    expect(ec.totals.m2Total).toBeCloseTo(2916.352 + 559.344 + 4901, 3);
  });

  it('warns when parameters changed or the price list differs', () => {
    const changed = item({ params: [{ cell: 'N4', label: 'PROFONDITA', unit: 'MM', value: 1700, original: 1594 }] });
    const other = item({ id: 'o', sourceWorkbook: 'TM1823-03 Analisi.xlsx', sourceOfferNo: 'TM1823-03' });
    const ec = computeElencoCosti(project([changed, other]));
    expect(ec.rows[0].warnings.some((w) => /not recomputed/.test(w))).toBe(true);
    expect(ec.rows[1].warnings.some((w) => /different price list/.test(w))).toBe(true);
  });
});
