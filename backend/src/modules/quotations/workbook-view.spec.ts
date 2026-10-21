import { describe, it, expect } from 'vitest';
import type { Quotation, QuotationItem } from '../../common/interfaces/quotation.interface';
import { computeElencoCosti } from './elenco-costi';
import { elencoCostiSheet } from './workbook-view';

const item = (id: string, over: Partial<QuotationItem> = {}): QuotationItem => ({
  id,
  catalogId: 'TM1643-06#10',
  referenceTabId: null,
  sourceWorkbook: 'TM1643-06 Analisi.xlsx',
  sourceSheet: '10',
  sourceOfferNo: 'TM1643-06',
  position: '01',
  itemCode: '01-01',
  description: 'PRE-FAB BALCONY',
  unit: 'Pcs',
  quantity: 50,
  L: 2560,
  H: 1600,
  lotto: 'L1201',
  params: [],
  historicalUnitCost: 1090.7,
  historicalQuantity: 712,
  unitCostOverride: null,
  dependsOnSheets: [],
  notes: '',
  ...over,
});

const quotation: Quotation = { id: 'p', ownerId: 'u', name: 'Nave 4', customer: 'APEXA', reference: 'TM2099-00', date: '2026-10-21', estimator: 'e', templateWorkbook: 'TM1643-06 Analisi.xlsx', items: [item('a'), item('b', { itemCode: '01-02', quantity: 5, unitCostOverride: 1200 })], createdAt: '', updatedAt: '', generations: [] };

describe('web workbook: ELENCO COSTI sheet layout', () => {
  const sheet = elencoCostiSheet(quotation, computeElencoCosti(quotation));
  const cell = (a: string) => sheet.cells.find((c) => c.addr === a);

  it('lays the rows out from row 6 with the sheet formulas and editable inputs', () => {
    expect(sheet.cols).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M']);
    expect(cell('E6')).toMatchObject({ v: 50, kind: 'input', edit: { itemId: 'a', field: 'quantity' } });
    expect(cell('H6')?.f).toBe('IF(AND(D6="m",G6<>0),G6/1000,G6*F6/1000000)');
    expect(cell('I6')?.f).toBe('IF(D6="m²",E6,H6*E6)');
    expect(cell('J6')).toMatchObject({ v: 1090.7, kind: 'formula', f: "ROUND('costi parz.'!$BE6,1)" });
    expect(cell('K6')).toMatchObject({ v: 54535, f: 'J6*E6' });
    expect(cell('J7')).toMatchObject({ v: 1200, kind: 'input' }); // manual override is an input cell
    expect(cell('L6')?.v).toContain('TM1643-06 / 10');
  });

  it('adds TOTAL COST and the summary block after the items', () => {
    expect(cell('A9')?.v).toBe('TOTAL COST');
    expect(cell('K9')).toMatchObject({ v: 54535 + 6000, f: 'SUM(K6:K8)' });
    expect(cell('A12')?.v).toBe('POS');
    expect(cell('A13')?.v).toBe('01');
    expect(cell('K13')?.v).toBeCloseTo(60535, 6);
    expect(sheet.rows).toEqual(expect.arrayContaining([1, 3, 6, 7, 9, 12, 13]));
  });
});
