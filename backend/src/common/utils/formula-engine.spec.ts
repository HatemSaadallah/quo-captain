import { describe, it, expect } from 'vitest';
import { Evaluator, ExcelError, parseFormula, type EvalContext, type Value } from './formula-engine';
import { colToNum, numToCol } from './a1';

/** A tiny in-memory workbook: { sheet: { A1: value | '=formula' } }. */
function ctxOf(sheets: Record<string, Record<string, Value | string>>, current = 'S'): EvalContext {
  const memo = new Map<string, Value>();
  const ctx: EvalContext = {
    fileName: 'Book.xlsx',
    sheetName: current,
    getCell(sheet, col, row) {
      const s = sheets[sheet ?? current];
      if (!s) return new ExcelError('#REF!');
      const key = `${sheet ?? current}!${numToCol(col)}${row}`;
      if (memo.has(key)) return memo.get(key)!;
      const raw = s[`${numToCol(col)}${row}`];
      let v: Value;
      if (typeof raw === 'string' && raw.startsWith('=')) v = new Evaluator({ ...ctx, sheetName: sheet ?? current }).eval(parseFormula(raw));
      else v = raw === undefined ? null : (raw as Value);
      memo.set(key, v);
      return v;
    },
    rangeRows(sheet, c1, c2, r1, r2) {
      const s = sheets[sheet ?? current] ?? {};
      const rows = new Set<number>();
      for (const k of Object.keys(s)) {
        const m = /^([A-Z]+)(\d+)$/.exec(k)!;
        const c = colToNum(m[1]);
        const r = Number(m[2]);
        if (c >= c1 && c <= c2 && r >= r1 && r <= r2) rows.add(r);
      }
      return [...rows].sort((a, b) => a - b);
    },
  };
  return ctx;
}

const run = (f: string, sheets: Record<string, Record<string, Value | string>> = {}): Value => new Evaluator(ctxOf(sheets)).eval(parseFormula(f));

describe('formula engine: operators and coercion', () => {
  it('arithmetic precedence, unary minus, percent and concatenation', () => {
    expect(run('1+2*3^2')).toBe(19);
    expect(run('-2^2')).toBe(4); // Excel: unary minus binds tighter than ^
    expect(run('(26*1.1*0+(20+3))*0+55')).toBe(55);
    expect(run('50%*2')).toBe(1);
    expect(run('"€/"&"PZ"')).toBe('€/PZ');
    expect(run('"a"&1.5')).toBe('a1.5');
  });
  it('blank and text coercion like Excel', () => {
    expect(run('A1+1', { S: {} })).toBe(1);
    expect(run('A1="" ', { S: {} })).toBe(true);
    expect(run('A1=0', { S: {} })).toBe(true);
    expect(run('"abc"=0')).toBe(false);
    expect(run('"ABC"="abc"')).toBe(true);
    expect(run('"12"+1')).toBe(13);
    expect((run('"abc"+1') as ExcelError).code).toBe('#VALUE!');
    expect((run('1/0') as ExcelError).code).toBe('#DIV/0!');
    expect(run('IFERROR(1/0,"x")')).toBe('x');
    expect((run('#REF!/2') as ExcelError).code).toBe('#REF!');
  });
});

describe('formula engine: functions used by the Somec sheets', () => {
  const dg: Record<string, Value | string> = { A19: 'CODICE LISTINO', A21: 'TA1', B21: null, C21: 0, D21: 'MQ', A22: 'TA2', B22: 'VS 44.4 temprato', C22: '=(26*1.1*0+(20+3))*0+55', D22: 'MQ', E22: null, F22: 'FORMATOR', G22: null, H22: null, I22: 'VETRO', A57: 'MANGE', C57: 35 };
  it('VLOOKUP exact match into DATI GEN., with IF/IFERROR wrappers', () => {
    const sheets = { S: { C72: 'TA2', C73: 'NOPE', C74: 0 }, 'DATI GEN.': dg };
    expect(run("IF(C72=0,0,VLOOKUP(C72,'DATI GEN.'!$A:$G,3,FALSE))", sheets)).toBe(55);
    expect(run("IF($C72=0,\"\",VLOOKUP($C72,'DATI GEN.'!$A:$J,9,FALSE))", sheets)).toBe('VETRO');
    expect((run("VLOOKUP(C73,'DATI GEN.'!$A:$G,3,FALSE)", sheets) as ExcelError).code).toBe('#N/A');
    expect(run("IF(C74=0,0,VLOOKUP(C74,'DATI GEN.'!$A:$G,3,FALSE))", sheets)).toBe(0);
    expect(run("IFERROR(VLOOKUP(C73,'DATI GEN.'!$A:$G,3,FALSE)*2,0)", sheets)).toBe(0);
  });
  it('SUMIF / COUNTIF / COUNTIFS / SUMPRODUCT over ranges', () => {
    const sheets = { S: { Q70: 'CODICE', Q71: 'ALUPRO', R71: 10, T71: 100, Q72: 'ALUPRO', R72: 5, T72: 50, Q73: 'VETRO', R73: 2, T73: 20, D4: 'ALUPRO', M8: 3, N8: 4 } };
    expect(run('SUMIF($Q$70:$Q$500,$D4,$R$70:$R$500)', sheets)).toBe(15);
    expect(run('SUMIF($Q$70:$Q$500,"VETRO",$T$70:$T$500)', sheets)).toBe(20);
    expect(run('COUNTIF(Q70:Q500,"ALUPRO")', sheets)).toBe(2);
    expect(run('COUNTIFS(Q70:Q500,"ALUPRO",R70:R500,">6")', sheets)).toBe(1);
    expect(run('SUMPRODUCT(R71:R73,T71:T73)', sheets)).toBe(10 * 100 + 5 * 50 + 2 * 20);
    expect(run('SUM(R71:R73,M8)', sheets)).toBe(20);
    expect(run('SUMIF(Q70:Q500,"<>",R70:R500)', sheets)).toBe(17);
  });
  it('rounding family', () => {
    expect(run('ROUND(1090.74075,1)')).toBe(1090.7);
    expect(run('ROUND(2.5,0)')).toBe(3);
    expect(run('INT(-1.5)')).toBe(-2);
    expect(run('TRUNC(-1.5)')).toBe(-1);
    expect(run('CEILING(4901.2,1)')).toBe(4902);
    expect(run('CEILING(2.5,0.5)')).toBe(2.5);
    expect(run('FLOOR(2.7,0.5)')).toBe(2.5);
    expect(run('FLOOR.MATH(2.7)')).toBe(2);
    expect(run('MAX(1,5,3)')).toBe(5);
    expect(run('PRODUCT(2,3,4)')).toBe(24);
  });
  it('text functions and the CELL("FILENAME") sheet-name idiom', () => {
    const sheets = { S: { B72: 'SOM-0444 109 mm' } };
    expect(run('RIGHT(B72,6)', sheets)).toBe('109 mm');
    expect(run('LEFT(RIGHT(B72,6),3)', sheets)).toBe('109');
    expect(run('VALUE(TRIM(" 10 "))')).toBe(10);
    expect(run('MID(CELL("FILENAME",A1),FIND("]",CELL("FILENAME",A1))+1,255)', { S: {} })).toBe('S');
    expect(run('CONCATENATE("Totale m² : ",ROUND(4743.4,0))')).toBe('Totale m² : 4743');
    expect(run('OR(1=1,2=3)')).toBe(true);
    expect(run('AND(1=1,2=3)')).toBe(false);
    expect(run('IF(TRUE,"y")')).toBe('y');
    expect(run('IF(FALSE,"y")')).toBe(false);
  });
  it('INDIRECT resolves the quantity lookup of an analysis sheet', () => {
    const sheets = { S: { R1: '10', T1: 'PZ', N5: 4.08, N3: 2560 }, 'ELENCO COSTI': { E10: 712 } };
    expect(run(`IFERROR(IF(T1="MQ",INDIRECT("'ELENCO COSTI'!E" & R1)/N5,IF(T1="ML",INDIRECT("'ELENCO COSTI'!E" & R1)/(N3/1000),INDIRECT("'ELENCO COSTI'!E" & R1))),1)`, sheets)).toBe(712);
    expect((run("'[2]Chiusura - Budget'!$G$78", sheets) as ExcelError).code).toBe('#REF!');
  });
  it('evaluates dependent formula cells lazily through the context', () => {
    const sheets = { S: { A1: 2, A2: '=A1*3', A3: '=SUM(A1:A2)+1', A4: '=A3=9' } };
    expect(run('A3', sheets)).toBe(9);
    expect(run('A4', sheets)).toBe(true);
  });
});
