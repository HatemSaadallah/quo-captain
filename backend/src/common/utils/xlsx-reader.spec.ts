import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { INPUT_DIR } from './paths';
import { XlsxWorkbook } from './xlsx-reader';
import { shiftFormula, colToNum, numToCol, sheetRef } from './a1';
import { KNOWN_WORKBOOKS, SHEETS } from '../../excel/somec-schema';

const wbPath = (n: string): string => path.join(INPUT_DIR, n);

describe('a1 helpers', () => {
  it('shifts relative refs only', () => {
    expect(shiftFormula('J6*E6', 5, 0)).toBe('J11*E11');
    expect(shiftFormula("ROUND('costi parz.'!$BE6,1)", 4, 0)).toBe("ROUND('costi parz.'!$BE10,1)");
    expect(shiftFormula('IF($A401=0,0,SUMIF(INDIRECT("\'" & $A401 & "\'!D3:D65"),G$5,INDIRECT("\'"& $A401 & "\'!G3:G65")))', -391, 0)).toBe(
      'IF($A10=0,0,SUMIF(INDIRECT("\'" & $A10 & "\'!D3:D65"),G$5,INDIRECT("\'"& $A10 & "\'!G3:G65")))',
    );
    expect(shiftFormula("MDO!C401/60*'DATI GEN.'!$C$57", -391, 0)).toBe("MDO!C10/60*'DATI GEN.'!$C$57");
    expect(shiftFormula('LOG10(A1)', 1, 1)).toBe('LOG10(B2)');
  });
  it('column helpers round-trip and sheet refs are quoted when needed', () => {
    for (const c of ['A', 'Z', 'AA', 'BE', 'CT', 'XFD']) expect(numToCol(colToNum(c))).toBe(c);
    expect(sheetRef('10', 'E67')).toBe("'10'!E67");
    expect(sheetRef('MDO', 'C10')).toBe('MDO!C10');
    expect(sheetRef('ELENCO COSTI', 'J10')).toBe("'ELENCO COSTI'!J10");
  });
});

describe('XlsxWorkbook on the real Somec files', () => {
  it.each(KNOWN_WORKBOOKS)('%s opens and exposes the required sheets', async (name) => {
    expect(existsSync(wbPath(name))).toBe(true);
    const wb = await XlsxWorkbook.open(wbPath(name));
    expect(wb.sheetNames.length).toBeGreaterThan(50);
    for (const s of [SHEETS.datiGen, SHEETS.boq, SHEETS.elencoCosti, SHEETS.costiParz, SHEETS.costiTot, SHEETS.quantita, SHEETS.mdo]) {
      expect(wb.hasSheet(s)).toBe(true);
    }
    expect(wb.externalLinks.length).toBeGreaterThan(0);
  });

  it('reads formulas and cached values separately (TM1643-06)', async () => {
    const wb = await XlsxWorkbook.open(wbPath('TM1643-06 Analisi.xlsx'));
    const ec = await wb.sheet(SHEETS.elencoCosti);
    expect(ec.cells.get('J10')).toMatchObject({ v: 1090.7, f: "ROUND('costi parz.'!$BE10,1)" });
    expect(ec.cells.get('K11')?.f).toBe('J11*E11');
    expect(ec.cells.get('F10')).toEqual(expect.objectContaining({ v: 2560 }));
    expect(ec.cells.get('F10')?.f).toBeUndefined();
    const s10 = await wb.sheet('10');
    expect(s10.cells.get('R1')?.f).toContain('CELL("FILENAME",A1)');
    expect(s10.cells.get('E67')?.v).toBeCloseTo(1090.74, 1);
  });

  it('surfaces cached error values', async () => {
    const wb = await XlsxWorkbook.open(wbPath('TM1641-03 Analisi.xlsx'));
    const dg = await wb.sheet(SHEETS.datiGen);
    expect(dg.cells.get('C5')).toMatchObject({ v: '#VALUE!', err: true });
    const s13 = await wb.sheet('13');
    expect(s13.cells.get('F4')).toMatchObject({ v: '#N/A', err: true });
  });
});
