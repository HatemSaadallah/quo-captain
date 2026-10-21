import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import type { CatalogRecord } from '../common/interfaces/catalog.interface';
import { INPUT_DIR } from '../common/utils/paths';
import { extractWorkbook, normalizeText, excelDateToIso } from './catalog-extractor';

const file = (n: string): string => path.join(INPUT_DIR, n);

describe('helpers', () => {
  it('normalises thousands separators and hyphenated words', () => {
    expect(normalizeText('PRE-FAB BALCONY Type 1 - 1.600x2.560 mm')).toBe('prefab balcony type 1 1600x2560 mm');
  });
  it('converts Excel serial dates', () => {
    expect(excelDateToIso(45723)).toBe('2025-03-07');
    expect(excelDateToIso('07.10.2025')).toBe('2025-10-07');
  });
});

describe('extractWorkbook TM1643-06', () => {
  let records: CatalogRecord[];
  let balcony: CatalogRecord | undefined;
  beforeAll(async () => {
    ({ records } = await extractWorkbook(file('TM1643-06 Analisi.xlsx')));
    balcony = records.find((r) => r.itemCode === '01-01');
  });

  it('extracts every item row with its analysis sheet', () => {
    expect(records.length).toBe(84);
    expect(records.every((r) => r.sheet !== null)).toBe(true);
  });

  it('finds the prefabricated balcony 1600x2560 with its historical cost', () => {
    expect(balcony).toBeDefined();
    expect(balcony!.sheet).toBe('10');
    expect(balcony!.row).toBe(10);
    expect(balcony!.title).toBe('PRE-FAB BALCONY Type 1 - 1.600x2.560 mm');
    expect(balcony!.unitCost).toBe(1090.7);
    expect(balcony!.sheetUnitCost).toBeCloseTo(1090.74, 1);
    expect(balcony!.quantity).toBe(712);
    expect(balcony!.unit).toBe('Pcs');
    expect(balcony!.L).toBe(2560);
    expect(balcony!.H).toBe(1600);
    expect(balcony!.categoryName).toBe('PRE-FAB BALCONIES');
    expect(balcony!.offerNo).toBe('TM1643-06');
    expect(balcony!.client).toBe('APEXA');
  });

  it('keeps provenance to the exact source cells', () => {
    expect(balcony!.workbook).toBe('TM1643-06 Analisi.xlsx');
    expect(balcony!.sourceCells.unitCost).toBe("'ELENCO COSTI'!J10");
    expect(balcony!.sourceCells.sheetUnitCost).toBe("'10'!E67");
    expect(balcony!.sourceCells.quantity).toBe("'ELENCO COSTI'!E10");
  });

  it('exposes editable technical parameters and the cost breakdown', () => {
    const w = balcony!.params.find((p) => p.cell === 'N3');
    expect(w).toMatchObject({ label: 'INTERASSE BALCONY', unit: 'MM', value: 2560, editable: true });
    expect(balcony!.params.find((p) => p.cell === 'N5')?.editable).toBe(false);
    expect(balcony!.costBreakdown.some((c) => c.code === 'ALUPRO' && c.total! > 0)).toBe(true);
    expect(balcony!.codesUsed.length).toBeGreaterThan(5);
    expect(balcony!.searchText).toContain('prefab balcony');
    expect(balcony!.searchText).toContain('1600x2560');
  });

  it('flags analysis sheets that depend on other analysis sheets', () => {
    const r221 = records.find((r) => r.row === 221);
    expect(r221?.dependsOnSheets).toEqual(expect.arrayContaining(['134', '135', '138']));
    expect(r221?.warnings.join(' ')).toContain('references other sheets');
  });
});

describe('extractWorkbook other workbooks', () => {
  it('TM1823-03 repeat project has the 1110.00 unit cost', async () => {
    const { records } = await extractWorkbook(file('TM1823-03 Analisi.xlsx'));
    const b = records.find((r) => r.itemCode === '01-01');
    expect(b?.unitCost).toBe(1110);
    expect(b?.sheet).toBe('10');
  });

  it('TM1641-03 reports items without an analysis sheet and the broken offer number', async () => {
    const { summary, records } = await extractWorkbook(file('TM1641-03 Analisi.xlsx'));
    expect(summary.offerNo).toBeNull();
    const missing = records.filter((r) => r.sheet === null);
    expect(missing.map((r) => r.itemCode)).toEqual(['11-02', '12-01', '15-04']);
    expect(missing[0].warnings.join(' ')).toContain("Analysis sheet '178' not found");
    expect(missing[0].unitCost).not.toBeNull();
    expect(records.every((r) => r.id.startsWith('TM1641-03#'))).toBe(true);
  });
});
