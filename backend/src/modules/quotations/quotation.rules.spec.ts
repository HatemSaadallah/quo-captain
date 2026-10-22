import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Catalog } from '../../common/interfaces/catalog.interface';
import type { Quotation } from '../../common/interfaces/quotation.interface';
import { CATALOG_FILE } from '../../common/utils/paths';
import { attachTab, blankRow, itemFromCatalog, validateQuotation } from './quotation.rules';

const catalog = JSON.parse(readFileSync(CATALOG_FILE, 'utf8')) as Catalog;
const balcony = catalog.records.find((r) => r.id === 'TM1643-06#10')!;
const template = catalog.workbooks.find((w) => w.workbook === 'TM1643-06 Analisi.xlsx')!;

function quotation(items: Quotation['items'], over: Partial<Quotation> = {}): Quotation {
  return {
    id: 'p1',
    name: 'Nave 4 balconies',
    customer: 'APEXA',
    reference: 'TM2099-00',
    date: '2026-10-21',
    estimator: 'Test',
    templateWorkbook: 'TM1643-06 Analisi.xlsx',
    items,
    createdAt: '',
    updatedAt: '',
    generations: [],
    ...over,
  };
}

describe('itemFromCatalog', () => {
  it('copies the historical analysis as an editable cart line', () => {
    const it = itemFromCatalog(balcony, 50);
    expect(it).toMatchObject({ catalogId: 'TM1643-06#10', sourceSheet: '10', itemCode: '01-01', quantity: 50, unit: 'Pcs', L: 2560, H: 1600, historicalUnitCost: 1090.7 });
    expect(it.params.map((p) => p.cell)).toEqual(['N3', 'N4']);
    expect(it.params[0]).toMatchObject({ label: 'INTERASSE BALCONY', value: 2560, original: 2560 });
  });
});

describe('validateQuotation', () => {
  it('accepts a complete quotation', () => {
    const v = validateQuotation(quotation([{ id: 'i1', ...itemFromCatalog(balcony, 50) }]), template);
    expect(v.ok).toBe(true);
    expect(v.estimatedTotal).toBe(54535);
  });

  it('rejects missing quantity, bad reference and empty cart; a missing sheet only warns (priced line)', () => {
    const bad = { id: 'i1', ...itemFromCatalog(balcony, 0), sourceSheet: null };
    const v = validateQuotation(quotation([bad], { reference: 'TM/2099' }), template);
    expect(v.ok).toBe(false);
    const msgs = v.issues.filter((i) => i.level === 'error').map((i) => i.message);
    expect(msgs.some((m) => /quantity must be a positive number/.test(m))).toBe(true);
    expect(msgs.some((m) => /Reference may only contain/.test(m))).toBe(true);
    expect(v.issues.some((i) => i.level === 'warning' && /no analysis sheet; exported as a priced line/.test(i.message))).toBe(true);
    expect(validateQuotation(quotation([]), template).issues.some((i) => /cart is empty/.test(i.message))).toBe(true);
  });

  it('flags incompatible configurations and cross-workbook price lists', () => {
    const r221 = catalog.records.find((r) => r.id === 'TM1643-06#221')!;
    const crossWb = validateQuotation(quotation([{ id: 'i1', ...itemFromCatalog(r221, 1) }], { templateWorkbook: 'TM1823-03 Analisi.xlsx' }), catalog.workbooks[2]);
    expect(crossWb.ok).toBe(false);
    expect(crossWb.issues.some((i) => /incompatible configuration/.test(i.message))).toBe(true);
    const sameWb = validateQuotation(quotation([{ id: 'i1', ...itemFromCatalog(r221, 1) }]), template);
    expect(sameWb.ok).toBe(true);
    expect(sameWb.issues.some((i) => i.level === 'warning' && /references sheets/.test(i.message))).toBe(true);
    const other = validateQuotation(quotation([{ id: 'i1', ...itemFromCatalog(catalog.records.find((r) => r.id === 'TM1823-03#10')!, 1) }]), template);
    expect(other.ok).toBe(true);
    expect(other.issues.some((i) => /costs will differ/.test(i.message))).toBe(true);
  });

  it('free rows export as priced lines (warned when unpriced), overrides are warned, attach fills blanks only', () => {
    const row = { id: 'r1', ...blankRow({ description: 'Balcony glass railing 2560 long', quantity: 12, unit: 'm', L: 2560, H: null }) };
    const v = validateQuotation(quotation([row]), template);
    const free = v.issues.find((i) => /no reference analysis and no price/.test(i.message));
    expect(free?.level).toBe('warning'); // does not block the Excel export any more
    const withOverride = validateQuotation(quotation([{ ...row, unitCostOverride: 250 }]), template);
    expect(withOverride.estimatedTotal).toBe(3000);
    expect(withOverride.issues.some((i) => /manual unit cost/.test(i.message))).toBe(true);
    const attached = attachTab(row, catalog.records.find((r) => r.id === 'TM1643-06#45')!, false);
    expect(attached.catalogId).toBe('TM1643-06#45');
    expect(attached.description).toBe('Balcony glass railing 2560 long'); // own text kept
    expect(attached.H).toBe(1130); // blank filled from the tab
    expect(attached.L).toBe(2560);
    expect(attached.quantity).toBe(12);
    expect(attached.historicalUnitCost).toBe(224.5);
    const overwritten = attachTab(row, catalog.records.find((r) => r.id === 'TM1643-06#45')!, true);
    expect(overwritten.description).toContain('BALUSTRADE');
  });

  it('flags a Pcs-priced tab attached to a row measured in metres', () => {
    const row = { id: 'r1', ...blankRow({ description: 'Railing', quantity: 12, unit: 'm', L: 2560, H: 1130 }) };
    const attached = { ...row, ...attachTab(row, balcony, false), id: 'r1' }; // balcony is priced per Pcs, row says m
    const v = validateQuotation(quotation([attached]), template, (id) => (id === balcony.id ? balcony.unit : undefined));
    expect(v.issues.some((i) => i.level === 'error' && /incompatible with the reference tab's unit/.test(i.message))).toBe(true);
    const ok = validateQuotation(quotation([{ ...attached, unit: 'PZ' }]), template, (id) => (id === balcony.id ? balcony.unit : undefined));
    expect(ok.issues.some((i) => /incompatible/.test(i.message))).toBe(false);
  });

  it('rejects an invalid mm parameter', () => {
    const it = { id: 'i1', ...itemFromCatalog(balcony, 1) };
    it.params[0].value = -5;
    expect(validateQuotation(quotation([it]), template).issues.some((i) => /must be a positive number of mm/.test(i.message))).toBe(true);
  });
});
