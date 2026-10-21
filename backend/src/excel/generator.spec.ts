import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Catalog } from '../common/interfaces/catalog.interface';
import type { Project } from '../common/interfaces/project.interface';
import { CATALOG_FILE, INPUT_DIR } from '../common/utils/paths';
import { XlsxWorkbook } from '../common/utils/xlsx-reader';
import { itemFromCatalog } from '../modules/projects/project.rules';
import { generateWorkbook, sha256File, type GenerationOutcome } from './generator';
import { validateGenerated } from './validator';
import { SHEETS } from './somec-schema';

const catalog = JSON.parse(readFileSync(CATALOG_FILE, 'utf8')) as Catalog;
const rec = (id: string) => catalog.records.find((r) => r.id === id)!;
const TEMPLATE = 'TM1643-06 Analisi.xlsx';
const SOURCE2 = 'TM1823-03 Analisi.xlsx';

describe('generateWorkbook (OOXML engine, TM1643-06 template)', () => {
  const outDir = mkdtempSync(path.join(os.tmpdir(), 'somec-gen-'));
  const project: Project = {
    id: 'p_test',
    name: 'Nave 4 - Balcony',
    customer: 'APEXA',
    reference: 'TM2099-00',
    date: '2026-10-21',
    estimator: 'Test Estimator',
    templateWorkbook: TEMPLATE,
    items: [
      { id: 'i1', ...itemFromCatalog(rec('TM1643-06#10'), 50) },
      { id: 'i2', ...itemFromCatalog(rec('TM1823-03#10'), 5) },
    ],
    createdAt: '',
    updatedAt: '',
    generations: [],
  };
  project.items[0].params[1].value = 1700; // PROFONDITA' BALCONY 1594 -> 1700
  let outcome: GenerationOutcome;
  let before: Record<string, string>;
  let out: XlsxWorkbook;

  beforeAll(async () => {
    before = { t: await sha256File(path.join(INPUT_DIR, TEMPLATE)), s: await sha256File(path.join(INPUT_DIR, SOURCE2)) };
    outcome = await generateWorkbook({ project, templatePath: path.join(INPUT_DIR, TEMPLATE), outputDir: outDir, sourcePathOf: (w) => path.join(INPUT_DIR, w) });
    out = await XlsxWorkbook.open(outcome.outputFile);
  });

  it('never modifies the source workbooks', async () => {
    expect(await sha256File(path.join(INPUT_DIR, TEMPLATE))).toBe(before.t);
    expect(await sha256File(path.join(INPUT_DIR, SOURCE2))).toBe(before.s);
    expect(outcome.sourceHashes[TEMPLATE]).toBe(before.t);
  });

  it('names the file after the reference and keeps the template structure', () => {
    expect(path.basename(outcome.outputFile)).toBe('TM2099-00 Analisi.xlsx');
    expect(existsSync(outcome.outputFile)).toBe(true);
    const tplSheets = 100;
    expect(out.sheetNames.length).toBe(tplSheets + 2);
    for (const s of [SHEETS.datiGen, SHEETS.boq, SHEETS.elencoCosti, SHEETS.costiParz, SHEETS.costiTot, SHEETS.quantita, SHEETS.mdo, SHEETS.bdgCosti]) expect(out.hasSheet(s)).toBe(true);
    expect(out.externalLinks.length).toBeGreaterThan(0); // not silently removed
    expect(out.calcPr.fullCalcOnLoad).toBe('1');
    expect(out.zip.file('xl/calcChain.xml')).toBeNull();
  });

  it('uses the first free rows and copies the analysis sheets under those names', async () => {
    expect(outcome.items.map((p) => p.row)).toEqual([6, 7]);
    expect(outcome.sheetsCopied).toEqual(['6', '7']);
    const s6 = await out.sheet('6');
    expect(s6.cells.get('R1')?.f).toContain('CELL("FILENAME",A1)');
    expect(s6.cells.get('T1')?.v).toBe('PZ');
    expect(s6.cells.get('N3')?.v).toBe(2560);
    expect(s6.cells.get('N4')?.v).toBe(1700); // parameter override written
    expect(s6.cells.get('N5')?.f).toBe('N4/1000*N3/1000'); // derived cell untouched
    const s7 = await out.sheet('7');
    expect(s7.cells.get('B1')?.f).toContain("'ELENCO COSTI'"); // cross-workbook copy keeps formulas
    expect(s7.cells.get('C71')?.v).toBeDefined();
  });

  it('writes the project header and the ELENCO COSTI / BOQ rows with live links', async () => {
    const dg = await out.sheet(SHEETS.datiGen);
    expect(dg.cells.get('C7')?.v).toBe('APEXA');
    expect(dg.cells.get('C8')?.v).toBe('Nave 4 - Balcony');
    expect(dg.cells.get('C9')?.v).toBe('Test Estimator');
    expect(dg.cells.get('C6')?.v).toBe(46316); // 2026-10-21 as Excel serial
    expect(dg.cells.get('C5')?.f).toContain('CELL("FILENAME"');
    const ec = await out.sheet(SHEETS.elencoCosti);
    expect(ec.cells.get('B6')?.v).toBe('01-01');
    expect(ec.cells.get('C6')?.v).toContain('PRE-FAB BALCONY Type 1');
    expect(ec.cells.get('E6')?.f).toBe('BOQ!I8');
    expect(ec.cells.get('F6')?.v).toBe(2560);
    expect(ec.cells.get('J6')?.f).toBe("ROUND('costi parz.'!$BE6,1)");
    expect(ec.cells.get('K6')?.f).toBe('J6*E6');
    expect(ec.cells.get('B7')?.v).toBe('01-01');
    expect(ec.cells.get('E7')?.f).toBe('BOQ!I9');
    // template items removed
    expect(ec.cells.get('B10')?.v ?? null).toBeNull();
    expect(ec.cells.get('E10')?.v).toBe(0);
    expect(ec.cells.get('J10')?.f).toBe("ROUND('costi parz.'!$BE10,1)"); // formulas kept
    const boq = await out.sheet(SHEETS.boq);
    expect(boq.cells.get('I8')?.v).toBe(50);
    expect(boq.cells.get('I9')?.v).toBe(5);
    expect(boq.cells.get('H8')?.f).toBe('$F8*$G8/1000000');
    expect(boq.cells.get('C8')?.f).toContain("VLOOKUP(B8,'ELENCO COSTI'!$B$5:$C$400,2,FALSE)");
    expect(boq.cells.get('I26')?.f ?? null).toBeNull(); // old BOQ content cleared
  });

  it('writes the workbook\'s own INDIRECT template formulas into the aggregation rows', async () => {
    const cp = await out.sheet(SHEETS.costiParz);
    expect(cp.cells.get('G6')?.f).toBe('IF($A6=0,0,SUMIF(INDIRECT("\'" & $A6 & "\'!D3:D65"),G$5,INDIRECT("\'"& $A6 & "\'!G3:G65")))');
    expect(cp.cells.get('BD7')?.f).toContain('$A7');
    expect(cp.cells.get('BE6')?.f).toBe('SUM(G6:BD6,C6,D6,E6)');
    expect(cp.cells.get('G10')?.v ?? null).toBeNull(); // pasted values of the template item cleared
    const qt = await out.sheet(SHEETS.quantita);
    expect(qt.cells.get('D6')?.f).toBe('MDO!$H6/60');
    expect(qt.cells.get('G6')?.f).toContain("INDIRECT(\"'\" & $A6 & \"'!D3:D65\")");
    expect(qt.cells.get('BP6')?.f).toContain("'!D70:D999\"");
    const mdo = await out.sheet(SHEETS.mdo);
    expect(mdo.cells.get('C6')?.f).toContain("INDIRECT(\"'\" & $A6 & \"'!D3:D65\")");
    expect(mdo.cells.get('H6')?.f).toBe("C6*'ELENCO COSTI'!$E6");
  });

  it('produces a validation report that is honest about recalculation', async () => {
    const report = await validateGenerated(project, outcome, { performed: false, method: 'none', detail: 'test' }, 'ooxml');
    expect(report.status).toBe('requires_review');
    expect(report.items).toHaveLength(2);
    // same workbook as the template: no code can be missing beyond those already #N/A in the source
    expect(report.items[0].missingCodes.length).toBeLessThanOrEqual(rec('TM1643-06#10').errorCells);
    expect(report.items[1].sourceWorkbook).toBe(SOURCE2);
    expect(Array.isArray(report.items[1].missingCodes)).toBe(true);
    expect(report.checks.filter((c) => c.level === 'error')).toEqual([]);
    expect(report.checks.some((c) => c.check === 'recalculation' && c.level === 'warning')).toBe(true);
    expect(report.totals.historicalEstimate).toBe(50 * 1090.7 + 5 * 1110);
    expect(report.totals.elencoCostiTotal).toBeNull();
    expect(report.externalLinks.length).toBeGreaterThan(0);
    expect(report.items[0].paramsWritten).toEqual([
      { cell: 'N3', value: 2560 },
      { cell: 'N4', value: 1700 },
    ]);
  });

  it('refuses an item without an analysis sheet', async () => {
    const bad: Project = { ...project, items: [{ id: 'x', ...itemFromCatalog(rec('TM1641-03#178'), 1) }], templateWorkbook: 'TM1641-03 Analisi.xlsx' };
    await expect(generateWorkbook({ project: bad, templatePath: path.join(INPUT_DIR, 'TM1641-03 Analisi.xlsx'), outputDir: outDir, sourcePathOf: (w) => path.join(INPUT_DIR, w) })).rejects.toThrow(/no source analysis sheet/);
  });

  it('flags sheets that depend on other analysis sheets', async () => {
    const dep: Project = { ...project, items: [{ id: 'd', ...itemFromCatalog(rec('TM1643-06#221'), 2) }] };
    const o = await generateWorkbook({ project: dep, templatePath: path.join(INPUT_DIR, TEMPLATE), outputDir: mkdtempSync(path.join(os.tmpdir(), 'somec-dep-')), sourcePathOf: (w) => path.join(INPUT_DIR, w) });
    const r = await validateGenerated(dep, o, { performed: false, method: 'none', detail: 'test' }, 'ooxml');
    expect(r.items[0].warnings.some((w) => /references sheet '134'/.test(w))).toBe(true);
    rmSync(path.dirname(o.outputFile), { recursive: true, force: true });
  });
});
