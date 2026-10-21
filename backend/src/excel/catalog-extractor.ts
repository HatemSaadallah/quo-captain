/**
 * Builds the historical product catalog from the Somec "Analisi" workbooks.
 * One record per ELENCO COSTI item row; the matching analysis sheet (named by
 * the row number) is parsed when present. Nothing is fabricated: missing
 * values stay null and are reported in `warnings`.
 */
import path from 'node:path';
import type { Catalog, CatalogParam, CatalogRecord, CostBreakdownRow, WorkbookSummary } from '../common/interfaces/catalog.interface';
import type { Cell, SheetData } from '../common/interfaces/xlsx.interface';
import { sheetRef } from '../common/utils/a1';
import { XlsxWorkbook } from '../common/utils/xlsx-reader';
import { ANALYSIS, DATI_GEN, EC, REQUIRED_SHEETS, SHEETS, isAnalysisSheetName } from './somec-schema';

export interface SheetRefAnalysis {
  dependsOnSheets: string[];
  hasExternalRefs: boolean;
  errorCells: number;
}

export interface WorkbookExtraction {
  summary: WorkbookSummary;
  records: CatalogRecord[];
}

const num = (c?: Cell): number | null => (c && typeof c.v === 'number' ? c.v : null);
const str = (c?: Cell): string | null => {
  if (!c || c.v === null || c.v === undefined || c.err) return null;
  const s = String(c.v).trim();
  return s === '' ? null : s;
};

export function excelDateToIso(v: number | string | null): string | null {
  if (v === null) return null;
  if (typeof v === 'string') {
    const m = /^(\d{2})[./-](\d{2})[./-](\d{4})$/.exec(v.trim());
    return m ? `${m[3]}-${m[2]}-${m[1]}` : v;
  }
  const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
  return d.toISOString().slice(0, 10);
}

/** Normalise text for deterministic search: "PRE-FAB 1.600x2.560" -> "prefab 1600x2560". */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/(\d)\.(\d{3})(?!\d)/g, '$1$2')
    .replace(/(\d),(\d{3})(?!\d)/g, '$1$2')
    .replace(/([a-z])-([a-z])/g, '$1$2')
    .replace(/[^a-z0-9àèéìòù]+/g, ' ')
    .trim();
}

function readParams(sheet: SheetData): CatalogParam[] {
  const out: CatalogParam[] = [];
  for (const r of ANALYSIS.paramRows) {
    const label = str(sheet.cells.get(ANALYSIS.paramCols.label + r));
    const valCell = sheet.cells.get(ANALYSIS.paramCols.value + r);
    if (!label || !valCell || valCell.v === null) continue;
    out.push({
      cell: ANALYSIS.paramCols.value + r,
      label,
      unit: str(sheet.cells.get(ANALYSIS.paramCols.unit + r)),
      value: valCell.err ? null : (valCell.v as number | string),
      editable: !valCell.f,
      ...(valCell.f ? { formula: valCell.f } : {}),
    });
  }
  return out;
}

function readBreakdown(sheet: SheetData): CostBreakdownRow[] {
  const out: CostBreakdownRow[] = [];
  const c = ANALYSIS.summaryCols;
  for (let r = ANALYSIS.summaryFirstRow; r <= ANALYSIS.summaryLastRow; r++) {
    const code = str(sheet.cells.get(c.category + r));
    const label = str(sheet.cells.get(c.label + r));
    if (!code || !label) continue;
    const total = num(sheet.cells.get(c.total + r));
    if (!total) continue;
    out.push({
      category: label,
      code,
      unit: str(sheet.cells.get(c.unit + r)),
      qty: num(sheet.cells.get(c.qty + r)),
      unitCost: num(sheet.cells.get(c.unitCost + r)),
      total,
    });
  }
  return out;
}

export function analyseSheetRefs(sheet: SheetData): SheetRefAnalysis {
  const deps = new Set<string>();
  let ext = false;
  let errors = 0;
  for (const cell of sheet.cells.values()) {
    if (cell.err) errors++;
    if (!cell.f) continue;
    if (/\[\d+\]/.test(cell.f)) ext = true;
    for (const m of cell.f.matchAll(/'([^']+)'!/g)) {
      if (isAnalysisSheetName(m[1]) || /^\d+\s*(old|OLD|Old)/.test(m[1])) deps.add(m[1]);
    }
    if (/#REF!/.test(cell.f)) deps.add('#REF!');
  }
  return { dependsOnSheets: [...deps], hasExternalRefs: ext, errorCells: errors };
}

/** Distinct price-list codes used by the line items (column C from row 71 down). */
export function lineItemCodes(sheet: SheetData): { codes: string[]; count: number } {
  const codes = new Set<string>();
  let count = 0;
  const col = ANALYSIS.lineItemCols.code;
  for (const [addr, cell] of sheet.cells) {
    const m = /^([A-Z]+)(\d+)$/.exec(addr);
    if (!m || m[1] !== col || Number(m[2]) < ANALYSIS.lineItemFirstRow) continue;
    const v = str(cell);
    if (v && v !== '0') {
      codes.add(v);
      count++;
    }
  }
  return { codes: [...codes].sort(), count };
}

export async function extractWorkbook(filePath: string): Promise<WorkbookExtraction> {
  const workbook = path.basename(filePath);
  const wb = await XlsxWorkbook.open(filePath);
  const dg = await wb.sheet(SHEETS.datiGen);
  const offerNo = str(dg.cells.get(DATI_GEN.offerNo));
  const client = str(dg.cells.get(DATI_GEN.client));
  const projectName = str(dg.cells.get(DATI_GEN.project));
  const estimator = str(dg.cells.get(DATI_GEN.estimator));
  const dateCell = dg.cells.get(DATI_GEN.date);
  const projectDate = excelDateToIso(dateCell && !dateCell.err ? (dateCell.v as number | string | null) : null);
  const country = str(dg.cells.get(DATI_GEN.country));
  wb.release(SHEETS.datiGen);

  const ec = await wb.sheet(SHEETS.elencoCosti);
  const categories = new Map<string, string>();
  for (let r = EC.totalRow + 1; r <= EC.totalRow + 60; r++) {
    const pos = str(ec.cells.get(EC.cols.pos + r));
    const name = str(ec.cells.get(EC.cols.description + r));
    if (pos && name && pos !== 'POS') categories.set(pos, name);
  }

  const records: CatalogRecord[] = [];
  for (let row = EC.firstRow; row <= EC.lastRow; row++) {
    const itemCode = str(ec.cells.get(EC.cols.item + row));
    if (!itemCode) continue;
    const warnings: string[] = [];
    const position = str(ec.cells.get(EC.cols.pos + row));
    const description = str(ec.cells.get(EC.cols.description + row));
    const unitCostCell = ec.cells.get(EC.cols.unitCost + row);
    const unitCost = num(unitCostCell);
    const qtyCell = ec.cells.get(EC.cols.qty + row);
    const sheetName = String(row);
    const sourceCells: Record<string, string> = {
      position: sheetRef(SHEETS.elencoCosti, EC.cols.pos + row),
      itemCode: sheetRef(SHEETS.elencoCosti, EC.cols.item + row),
      description: sheetRef(SHEETS.elencoCosti, EC.cols.description + row),
      unit: sheetRef(SHEETS.elencoCosti, EC.cols.unit + row),
      quantity: sheetRef(SHEETS.elencoCosti, EC.cols.qty + row),
      L: sheetRef(SHEETS.elencoCosti, EC.cols.L + row),
      H: sheetRef(SHEETS.elencoCosti, EC.cols.H + row),
      unitCost: sheetRef(SHEETS.elencoCosti, EC.cols.unitCost + row),
      totalCost: sheetRef(SHEETS.elencoCosti, EC.cols.totalCost + row),
      sheetRef: sheetRef(SHEETS.elencoCosti, EC.cols.sheetRef + row),
    };
    if (!description) warnings.push('Description missing in ELENCO COSTI');
    if (unitCostCell?.err) warnings.push(`Unit cost is an Excel error (${unitCostCell.v})`);
    else if (unitCost === null) warnings.push('Unit cost missing');
    else if (unitCost === 0) warnings.push('Unit cost is 0');
    if (qtyCell?.err) warnings.push(`Quantity is an Excel error (${qtyCell.v})`);
    if (qtyCell?.f && !/BOQ!/.test(qtyCell.f)) warnings.push('Quantity is not linked to BOQ');
    if (!qtyCell?.f) warnings.push('Quantity typed directly in ELENCO COSTI (not linked to BOQ)');
    if (offerNo === null) warnings.push('Offer number formula unresolved in source workbook (DATI GEN.!C5)');

    let sheet: SheetData | null = null;
    if (wb.hasSheet(sheetName)) sheet = await wb.sheet(sheetName);
    else warnings.push(`Analysis sheet '${sheetName}' not found in workbook`);

    let params: CatalogParam[] = [];
    let costBreakdown: CostBreakdownRow[] = [];
    let codesUsed: string[] = [];
    let lineItemCount = 0;
    let refs: SheetRefAnalysis = { dependsOnSheets: [], hasExternalRefs: false, errorCells: 0 };
    let sheetUnitCost: number | null = null;
    let sheetTotalCost: number | null = null;
    let unitWeightKg: number | null = null;
    let analysisUnit: string | null = null;
    let productClass: string | null = null;
    if (sheet) {
      params = readParams(sheet);
      costBreakdown = readBreakdown(sheet);
      refs = analyseSheetRefs(sheet);
      sheetUnitCost = num(sheet.cells.get(ANALYSIS.unitCost));
      sheetTotalCost = num(sheet.cells.get(ANALYSIS.totalCost));
      unitWeightKg = num(sheet.cells.get(ANALYSIS.unitWeight));
      analysisUnit = str(sheet.cells.get(ANALYSIS.unit));
      productClass = str(sheet.cells.get(ANALYSIS.productClass));
      const li = lineItemCodes(sheet);
      codesUsed = li.codes;
      lineItemCount = li.count;
      sourceCells.sheetUnitCost = sheetRef(sheetName, ANALYSIS.unitCost);
      sourceCells.sheetTotalCost = sheetRef(sheetName, ANALYSIS.totalCost);
      sourceCells.sheetItemCode = sheetRef(sheetName, ANALYSIS.itemCode);
      sourceCells.sheetQty = sheetRef(sheetName, ANALYSIS.qty);
      const sheetItem = str(sheet.cells.get(ANALYSIS.itemCode));
      if (sheetItem && sheetItem !== itemCode) warnings.push(`Sheet item code '${sheetItem}' differs from ELENCO COSTI '${itemCode}'`);
      const r1 = sheet.cells.get(ANALYSIS.sheetNameCell);
      if (!r1?.f || !/CELL\("FILENAME"/i.test(r1.f)) warnings.push('Sheet does not derive its number from CELL("FILENAME") (non-standard layout)');
      if (refs.errorCells > 0) warnings.push(`${refs.errorCells} cells with Excel errors in analysis sheet`);
      if (refs.dependsOnSheets.length) warnings.push(`Analysis sheet references other sheets: ${refs.dependsOnSheets.join(', ')}`);
      if (refs.hasExternalRefs) warnings.push('Analysis sheet references an external workbook');
      if (sheetUnitCost !== null && unitCost !== null && Math.abs(sheetUnitCost - unitCost) > 0.11) {
        warnings.push(`Sheet unit cost ${sheetUnitCost.toFixed(2)} differs from ELENCO COSTI ${unitCost} (stale pasted values in costi parz.)`);
      }
      wb.release(sheetName);
    }

    const categoryName = position ? (categories.get(position) ?? null) : null;
    const title = description ? description.split(/\r?\n/)[0].trim() : null;
    const L = num(ec.cells.get(EC.cols.L + row));
    const H = num(ec.cells.get(EC.cols.H + row));
    const unit = str(ec.cells.get(EC.cols.unit + row));
    const searchText = normalizeText(
      [description ?? '', itemCode, position ?? '', categoryName ?? '', workbook, sheetName, offerNo ?? '', productClass ?? '', analysisUnit ?? '', unit ?? '', L && H ? `${L}x${H} ${H}x${L}` : '', ...params.map((p) => p.label)].join(' '),
    );

    records.push({
      id: `${offerNo ?? workbook.replace(/\s.*$/, '')}#${row}`,
      workbook,
      offerNo,
      client,
      projectName,
      estimator,
      projectDate,
      row,
      sheet: sheet ? sheetName : null,
      position,
      categoryName,
      itemCode,
      title,
      description,
      unit,
      quantity: num(qtyCell),
      L,
      H,
      m2Unit: num(ec.cells.get(EC.cols.m2Unit + row)),
      unitCost,
      totalCost: num(ec.cells.get(EC.cols.totalCost + row)),
      lotto: str(ec.cells.get(EC.cols.lotto + row)),
      analysisUnit,
      productClass,
      sheetUnitCost,
      sheetTotalCost,
      unitWeightKg,
      params,
      costBreakdown,
      lineItemCount,
      codesUsed,
      errorCells: refs.errorCells,
      dependsOnSheets: refs.dependsOnSheets,
      hasExternalRefs: refs.hasExternalRefs,
      sourceCells,
      warnings,
      searchText,
    });
  }

  const summary: WorkbookSummary = {
    workbook,
    offerNo,
    client,
    projectName,
    estimator,
    projectDate,
    country,
    sheetCount: wb.sheetNames.length,
    analysisSheetCount: wb.sheetNames.filter(isAnalysisSheetName).length,
    itemCount: records.length,
    totalCost: num(ec.cells.get(EC.cols.totalCost + EC.totalRow)),
    externalLinks: [...new Set(wb.externalLinks.map((e) => e.target))],
    calcPr: wb.calcPr,
    freeItemRows: freeItemRows(wb.sheetNames, ec).length,
    requiredSheetsPresent: REQUIRED_SHEETS.every((s) => wb.hasSheet(s)),
  };
  return { summary, records };
}

/** ELENCO COSTI rows that can receive a new item: no item code and no analysis sheet with that number. */
export function freeItemRows(sheetNames: string[], ec: SheetData): number[] {
  const names = new Set(sheetNames);
  const rows: number[] = [];
  for (let row = EC.firstRow; row <= EC.lastRow; row++) {
    if (str(ec.cells.get(EC.cols.item + row)) || names.has(String(row))) continue;
    rows.push(row);
  }
  return rows;
}

export async function buildCatalog(files: string[]): Promise<Catalog> {
  const workbooks: WorkbookSummary[] = [];
  const records: CatalogRecord[] = [];
  for (const f of files) {
    const { summary, records: r } = await extractWorkbook(f);
    workbooks.push(summary);
    records.push(...r);
  }
  return { generatedAt: new Date().toISOString(), workbooks, records };
}
