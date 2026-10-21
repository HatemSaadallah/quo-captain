import { describe, it, expect } from 'vitest';
import { clearRange, unshareFormulas, upsertCell } from './xlsx-editor';
import { parseSheetXml } from './xlsx-reader';

const wrap = (rows: string): string => `<?xml version="1.0"?><worksheet><dimension ref="A1:D3"/><sheetData>${rows}</sheetData><mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells></worksheet>`;
const cells = (xml: string) => parseSheetXml('t', 'p', xml, ['hello']).cells;

describe('upsertCell', () => {
  const base = wrap('<row r="1" spans="1:3"><c r="A1" s="5"><v>1</v></c><c r="C1" t="s"><v>0</v></c></row><row r="3"><c r="A3"><f>A1*2</f><v>2</v></c></row>');

  it('replaces an existing cell keeping its style', () => {
    const out = upsertCell(base, 'A1', { v: 42 });
    expect(out).toContain('<c r="A1" s="5"><v>42</v></c>');
    expect(cells(out).get('A1')).toMatchObject({ v: 42, s: 5 });
  });

  it('inserts a cell in column order inside an existing row', () => {
    const out = upsertCell(base, 'B1', { v: 'x' });
    const row = /<row r="1"[^>]*>([\s\S]*?)<\/row>/.exec(out)![1];
    expect(row.indexOf('r="A1"')).toBeLessThan(row.indexOf('r="B1"'));
    expect(row.indexOf('r="B1"')).toBeLessThan(row.indexOf('r="C1"'));
    expect(cells(out).get('B1')?.v).toBe('x');
    expect(cells(out).get('C1')?.v).toBe('hello');
  });

  it('inserts a missing row in order and writes formulas without cached values', () => {
    const out = upsertCell(upsertCell(base, 'D2', { f: '=SUM(A1:C1)' }), 'A4', { v: true });
    expect(out.indexOf('<row r="1"')).toBeLessThan(out.indexOf('<row r="2"'));
    expect(out.indexOf('<row r="2"')).toBeLessThan(out.indexOf('<row r="3"'));
    expect(out.indexOf('<row r="3"')).toBeLessThan(out.indexOf('<row r="4"'));
    expect(out).toContain('<c r="D2"><f>SUM(A1:C1)</f></c>');
    expect(cells(out).get('D2')).toMatchObject({ f: 'SUM(A1:C1)', v: null });
    expect(cells(out).get('A4')?.v).toBe(true);
    expect(out).toContain('<mergeCell ref="A1:B1"/>'); // untouched parts survive
  });

  it('escapes text and keeps carriage returns', () => {
    const out = upsertCell(base, 'B3', { v: 'a <b> & "c"\r\nline2' });
    expect(out).toContain('t="inlineStr"><is><t xml:space="preserve">a &lt;b&gt; &amp; &quot;c&quot;&#xD;\nline2</t></is>');
    expect(cells(out).get('B3')?.v).toBe('a <b> & "c"\r\nline2');
  });

  it('does not confuse A1 with A10', () => {
    const x = wrap('<row r="10"><c r="A10"><v>10</v></c></row>');
    const out = upsertCell(x, 'A1', { v: 1 });
    expect(cells(out).get('A1')?.v).toBe(1);
    expect(cells(out).get('A10')?.v).toBe(10);
  });
});

describe('unshareFormulas', () => {
  it('materialises shared formulas so single cells can be rewritten', () => {
    const x = wrap('<row r="6"><c r="K6"><f t="shared" ref="K6:K8" si="1">J6*E6</f><v>0</v></c></row><row r="7"><c r="K7"><f t="shared" si="1"/><v>0</v></c></row><row r="8"><c r="K8" s="2"><f t="shared" si="1"/><v>0</v></c></row>');
    const out = unshareFormulas(x);
    expect(out).not.toContain('t="shared"');
    expect(cells(out).get('K7')?.f).toBe('J7*E7');
    expect(cells(out).get('K8')?.f).toBe('J8*E8');
    const rewritten = upsertCell(out, 'K6', { v: 5 });
    expect(cells(rewritten).get('K8')?.f).toBe('J8*E8'); // dependants unaffected
  });
});

describe('clearRange', () => {
  const x = wrap('<row r="6"><c r="A6" s="1"><v>1</v></c><c r="G6"><v>2</v></c><c r="H6"><f>G6*2</f><v>4</v></c></row><row r="7"><c r="G7"><v>3</v></c></row>');
  it('clears only the requested rows and columns, keeping styles', () => {
    const out = clearRange(x, new Set([6]), 'G', 'H');
    expect(out).toContain('<c r="A6" s="1"><v>1</v></c>');
    expect(out).toContain('<c r="G6"/>');
    expect(out).toContain('<c r="H6"/>');
    expect(out).toContain('<c r="G7"><v>3</v></c>');
  });
  it('clears whole rows with a range', () => {
    const out = clearRange(x, [6, 7]);
    expect(cells(out).get('A6')?.v).toBeNull();
    expect(cells(out).get('G7')?.v).toBeNull();
    expect(cells(out).get('A6')?.s).toBe(1);
  });
});
