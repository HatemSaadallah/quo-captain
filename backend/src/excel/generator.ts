/**
 * Builds a new "Analisi" workbook from a template workbook and the cart items.
 *
 * Strategy (all at OOXML level, Excel is used afterwards only to recalculate):
 *  1. start from a copy of the template (the original is never written to);
 *  2. write the project header into DATI GEN.;
 *  3. empty the template's own items (ELENCO COSTI rows, BOQ rows, pasted values in
 *     costi parz./quantità/MDO) so the output contains exactly the cart;
 *  4. for every cart item: copy the historical analysis sheet into the output under the
 *     name of its new ELENCO COSTI row, write the ELENCO COSTI + BOQ rows, and write
 *     the workbook's own row-401 template formulas (INDIRECT by sheet name) into that
 *     row of costi parz., quantità and MDO;
 *  5. force a full recalculation on next open and drop the stale calc chain.
 */
import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Project, ProjectItem } from '../common/interfaces/project.interface';
import type { SheetData } from '../common/interfaces/xlsx.interface';
import { colRange, shiftFormula } from '../common/utils/a1';
import { XlsxEditor } from '../common/utils/xlsx-editor';
import { XlsxWorkbook } from '../common/utils/xlsx-reader';
import { freeItemRows } from './catalog-extractor';
import { AGG, ANALYSIS, BOQ, DATI_GEN, EC, REQUIRED_SHEETS, SHEETS } from './somec-schema';

export interface GenerationInput {
  project: Project;
  templatePath: string;
  /** Resolves a source workbook file name (data/input) to its path. */
  sourcePathOf: (workbook: string) => string;
  outputDir: string;
}

export interface PlannedItem {
  item: ProjectItem;
  row: number;
  sheet: string;
  boqRow: number;
  paramsWritten: Array<{ cell: string; value: number | string | null }>;
  warnings: string[];
}

export interface GenerationOutcome {
  outputFile: string;
  templatePath: string;
  items: PlannedItem[];
  sheetsCopied: string[];
  sheetsModified: string[];
  templateRowsCleared: number[];
  changes: string[];
  sourceHashes: Record<string, string>;
}

export function excelSerial(isoDate: string): number {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date ${isoDate}`);
  return Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(1899, 11, 30)) / 86400000);
}

export function safeFileStem(reference: string): string {
  const s = reference.trim().replace(/[\\/:*?"<>|]/g, '-').replace(/\.xls[xmb]?$/i, '');
  if (!s) throw new Error('Reference is empty');
  return s;
}

export async function sha256File(file: string): Promise<string> {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

/** Formulas of the row holding the live template formulas (row 401), per column. */
function templateRowFormulas(sheet: SheetData, cols: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of cols) {
    const f = sheet.cells.get(c + EC.templateRow)?.f;
    if (f) out.set(c, f);
  }
  return out;
}

async function writeTemplateFormulas(ed: XlsxEditor, tpl: XlsxWorkbook, sheetName: string, cols: string[], row: number): Promise<number> {
  const sheet = await tpl.sheet(sheetName);
  const formulas = templateRowFormulas(sheet, cols);
  let n = 0;
  for (const [col, f] of formulas) {
    const existing = sheet.cells.get(col + row);
    if (existing?.f) continue; // already a formula in this row (A, B, C..F, BE, ...)
    await ed.setCell(sheetName, col + row, { f: shiftFormula(f, row - EC.templateRow, 0) });
    n++;
  }
  return n;
}

export async function generateWorkbook(input: GenerationInput): Promise<GenerationOutcome> {
  const { project, templatePath, outputDir } = input;
  const templateBuf = await readFile(templatePath);
  const tpl = await XlsxWorkbook.fromBuffer(templateBuf, templatePath);
  for (const s of REQUIRED_SHEETS) if (!tpl.hasSheet(s)) throw new Error(`Template lacks required sheet '${s}'`);
  const ed = await XlsxEditor.fromBuffer(templateBuf, templatePath);
  const sourceHashes: Record<string, string> = { [path.basename(templatePath)]: createHash('sha256').update(templateBuf).digest('hex') };

  // --- plan rows
  const ec = await tpl.sheet(SHEETS.elencoCosti);
  const free = freeItemRows(tpl.sheetNames, ec);
  if (project.items.length > free.length) throw new Error(`Template has ${free.length} free item rows, cart has ${project.items.length}`);
  const planned: PlannedItem[] = project.items.map((item, i) => ({ item, row: free[i], sheet: String(free[i]), boqRow: BOQ.firstRow + i, paramsWritten: [], warnings: [] }));
  for (const p of planned) if (!p.item.sourceSheet) throw new Error(`Item ${p.item.itemCode} has no source analysis sheet`);

  // --- 1. project header
  await ed.setCells(SHEETS.datiGen, {
    [DATI_GEN.date]: { v: excelSerial(project.date) },
    [DATI_GEN.client]: { v: project.customer },
    [DATI_GEN.project]: { v: project.name },
    [DATI_GEN.estimator]: { v: project.estimator },
  });

  // --- 2. empty the template's own items (fresh workbook: output == cart)
  const templateRows = new Set<number>();
  for (let r = EC.firstRow; r <= EC.lastRow; r++) if (ec.cells.get(EC.cols.item + r)?.v) templateRows.add(r);
  const c = EC.cols;
  await ed.clearRange(SHEETS.elencoCosti, templateRows, c.pos, c.unit);
  await ed.clearRange(SHEETS.elencoCosti, templateRows, c.L, c.H);
  await ed.clearRange(SHEETS.elencoCosti, templateRows, c.lotto, c.prevUnitCost);
  for (const r of templateRows) await ed.setCell(SHEETS.elencoCosti, c.qty + r, { v: 0 });
  await ed.clearRange(SHEETS.costiParz, templateRows, AGG.costiParz.firstCatCol, AGG.costiParz.lastCatCol);
  await ed.clearRange(SHEETS.quantita, templateRows, AGG.quantita.firstCatCol, AGG.quantita.lastCatCol);
  await ed.clearRange(SHEETS.quantita, templateRows, AGG.quantita.extraCols[0], AGG.quantita.glassLastCol);
  await ed.clearRange(SHEETS.mdo, templateRows, AGG.mdo.firstCol, AGG.mdo.lastCol);
  const boq = await tpl.sheet(SHEETS.boq);
  let boqLast: number = BOQ.firstRow;
  for (const addr of boq.cells.keys()) boqLast = Math.max(boqLast, Number(addr.replace(/^[A-Z]+/, '')));
  await ed.clearRows(SHEETS.boq, BOQ.firstRow, boqLast);
  tpl.release(SHEETS.boq);

  // --- 3. items
  const sourceZips = new Map<string, JSZip>();
  const sheetsCopied: string[] = [];
  const boqDescFormula = boq.cells.get(BOQ.cols.description + BOQ.firstRow)?.f;
  const ecFormulaCols = [c.m2Unit, c.m2Total, c.unitCost, c.totalCost, c.sheetRef, c.prevTotal];
  const ecRowTemplate = new Map<string, string>();
  for (const col of ecFormulaCols) {
    const f = ec.cells.get(col + EC.firstRow)?.f;
    if (f) ecRowTemplate.set(col, f);
  }
  const aggCols = {
    [SHEETS.costiParz]: colRange('A', AGG.costiParz.unitCostCol),
    [SHEETS.quantita]: colRange('A', AGG.quantita.glassLastCol),
    [SHEETS.mdo]: colRange('A', 'U'),
  };

  for (const p of planned) {
    const { item, row, sheet, boqRow } = p;
    let src: JSZip;
    if (item.sourceWorkbook === project.templateWorkbook) src = ed.zip;
    else {
      let z = sourceZips.get(item.sourceWorkbook);
      if (!z) {
        const srcPath = input.sourcePathOf(item.sourceWorkbook);
        const buf = await readFile(srcPath);
        sourceHashes[item.sourceWorkbook] = createHash('sha256').update(buf).digest('hex');
        z = await JSZip.loadAsync(buf);
        sourceZips.set(item.sourceWorkbook, z);
      }
      src = z;
    }
    const copied = await ed.copySheet(src, item.sourceSheet!, sheet);
    p.warnings.push(...copied.warnings);
    sheetsCopied.push(sheet);

    // technical parameters (literal input cells of the analysis sheet)
    for (const prm of item.params) {
      if (prm.value === null || prm.value === undefined) continue;
      if (!/^[A-Z]{1,2}\d{1,2}$/.test(prm.cell)) throw new Error(`Refusing to write parameter to unexpected cell ${prm.cell}`);
      await ed.setCell(sheet, prm.cell, { v: prm.value });
      p.paramsWritten.push({ cell: prm.cell, value: prm.value });
    }

    // ELENCO COSTI row (== sheet name)
    await ed.setCells(SHEETS.elencoCosti, {
      [c.pos + row]: { v: item.position },
      [c.item + row]: { v: item.itemCode },
      [c.description + row]: { v: item.description },
      [c.unit + row]: { v: item.unit },
      [c.qty + row]: { f: `${SHEETS.boq}!I${boqRow}` },
      [c.L + row]: { v: item.L },
      [c.H + row]: { v: item.H },
      [c.lotto + row]: { v: item.lotto },
    });
    for (const [col, f] of ecRowTemplate) {
      if (!ec.cells.get(col + row)?.f) await ed.setCell(SHEETS.elencoCosti, col + row, { f: shiftFormula(f, row - EC.firstRow, 0) });
    }

    // BOQ row: quantity input lives here, exactly like the historical workbooks
    const b = BOQ.cols;
    await ed.setCells(SHEETS.boq, {
      [b.pos + boqRow]: { v: item.position },
      [b.item + boqRow]: { v: item.itemCode },
      [b.description + boqRow]: {
        f: boqDescFormula
          ? shiftFormula(boqDescFormula, boqRow - BOQ.firstRow, 0)
          : `IFERROR(LEFT(VLOOKUP(B${boqRow},'ELENCO COSTI'!$B$5:$C$400,2,FALSE),SEARCH(CHAR(10),VLOOKUP(B${boqRow},'ELENCO COSTI'!$B$5:$C$400,2,FALSE))),LEFT(VLOOKUP(B${boqRow},'ELENCO COSTI'!$B$5:$C$400,2,FALSE),50))`,
      },
      [b.L + boqRow]: { v: item.L },
      [b.H + boqRow]: { v: item.H },
      [b.m2Unit + boqRow]: { f: `$F${boqRow}*$G${boqRow}/1000000` },
      [b.pcs + boqRow]: { v: item.quantity },
      [b.length + boqRow]: { f: `F${boqRow}*$I${boqRow}/1000` },
      [b.surface + boqRow]: { f: `H${boqRow}*$I${boqRow}` },
    });

    // aggregation rows: the workbook's own INDIRECT template formulas, shifted to this row
    for (const [sheetName, cols] of Object.entries(aggCols)) await writeTemplateFormulas(ed, tpl, sheetName, cols, row);
  }

  // --- 4. finish
  ed.setFullCalcOnLoad();
  await ed.removeCalcChain();
  mkdirSync(outputDir, { recursive: true });
  const outputFile = path.join(outputDir, `${safeFileStem(project.reference)} Analisi.xlsx`);
  await ed.save(outputFile);

  return {
    outputFile,
    templatePath,
    items: planned,
    sheetsCopied,
    sheetsModified: [SHEETS.datiGen, SHEETS.elencoCosti, SHEETS.boq, SHEETS.costiParz, SHEETS.quantita, SHEETS.mdo],
    templateRowsCleared: [...templateRows],
    changes: [...ed.changes],
    sourceHashes,
  };
}

export { ANALYSIS };
