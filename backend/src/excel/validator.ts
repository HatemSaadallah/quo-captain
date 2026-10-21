/**
 * Validates a generated workbook by reading it back (formulas + cached values).
 * A saved file is not proof of correct costs: unless Excel recalculated the file,
 * every cached value is stale and the report says so.
 */
import type { CheckResult, GeneratedItemReport, ValidationReport, GenerationEngine } from '../common/interfaces/generation.interface';
import type { Project } from '../common/interfaces/project.interface';
import { sheetRef } from '../common/utils/a1';
import { XlsxWorkbook } from '../common/utils/xlsx-reader';
import { analyseSheetRefs, lineItemCodes } from './catalog-extractor';
import type { GenerationOutcome } from './generator';
import { AGG, ANALYSIS, BOQ, DATI_GEN, EC, SHEETS } from './somec-schema';

export interface RecalcInfo {
  performed: boolean;
  method: string;
  detail: string;
}

const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

export async function validateGenerated(project: Project, outcome: GenerationOutcome, recalc: RecalcInfo, engine: GenerationEngine): Promise<ValidationReport> {
  const wb = await XlsxWorkbook.open(outcome.outputFile);
  const checks: CheckResult[] = [];
  const ok = (check: string, detail: string, where?: string): void => {
    checks.push(where ? { level: 'ok', check, detail, where } : { level: 'ok', check, detail });
  };
  const warn = (check: string, detail: string, where?: string): void => {
    checks.push(where ? { level: 'warning', check, detail, where } : { level: 'warning', check, detail });
  };
  const err = (check: string, detail: string, where?: string): void => {
    checks.push(where ? { level: 'error', check, detail, where } : { level: 'error', check, detail });
  };

  // price list of the output (template) for code lookups
  const dg = await wb.sheet(SHEETS.datiGen);
  const priceCodes = new Set<string>();
  for (const [addr, cell] of dg.cells) {
    const m = /^A(\d+)$/.exec(addr);
    if (m && Number(m[1]) >= DATI_GEN.priceListHeaderRow && cell.v !== null && !cell.f) priceCodes.add(String(cell.v).trim());
  }
  if (dg.cells.get(DATI_GEN.client)?.v !== project.customer) err('header', 'DATI GEN. client was not written', sheetRef(SHEETS.datiGen, DATI_GEN.client));
  else ok('header', 'DATI GEN. header (date, client, project, estimator) written');
  if (!dg.cells.get(DATI_GEN.offerNo)?.f) err('header', 'DATI GEN.!C5 offer-number formula missing');
  wb.release(SHEETS.datiGen);

  const ec = await wb.sheet(SHEETS.elencoCosti);
  const cp = await wb.sheet(SHEETS.costiParz);
  const qt = await wb.sheet(SHEETS.quantita);
  const mdo = await wb.sheet(SHEETS.mdo);
  const boq = await wb.sheet(SHEETS.boq);

  // template rows really emptied?
  const leftovers = outcome.templateRowsCleared.filter((r) => ec.cells.get(EC.cols.item + r)?.v);
  if (leftovers.length) err('fresh', `Template items still present in ELENCO COSTI rows ${leftovers.join(', ')}`);
  else ok('fresh', `${outcome.templateRowsCleared.length} template item rows emptied; output contains only the cart`);

  const items: GeneratedItemReport[] = [];
  let errorCellsTotal = 0;
  let sumOfItems = 0;
  let sumKnown = true;
  for (const p of outcome.items) {
    const { item, row, sheet, boqRow } = p;
    const where = `'${sheet}'`;
    const warnings = [...p.warnings];
    if (!wb.hasSheet(sheet)) {
      err('sheet', `Analysis sheet '${sheet}' missing`, where);
      items.push({ itemId: item.id, position: item.position, itemCode: item.itemCode, sourceWorkbook: item.sourceWorkbook, sourceSheet: item.sourceSheet ?? '', row, sheet, boqRow, quantity: item.quantity, historicalUnitCost: item.historicalUnitCost, unitCost: null, sheetUnitCost: null, totalCost: null, missingCodes: [], errorCells: 0, paramsWritten: p.paramsWritten, warnings: ['sheet missing'] });
      sumKnown = false;
      continue;
    }
    const s = await wb.sheet(sheet);
    // identity formulas
    const r1 = s.cells.get(ANALYSIS.sheetNameCell)?.f ?? '';
    if (!/CELL\("FILENAME"/i.test(r1)) err('sheet-identity', `${where}!R1 does not derive the sheet number from CELL("FILENAME")`, where);
    const t2 = s.cells.get(ANALYSIS.itemCode)?.f ?? '';
    if (!/costi parz\./.test(t2)) err('sheet-identity', `${where}!T2 does not look up the item code in costi parz.`, where);
    const t3 = s.cells.get(ANALYSIS.qty)?.f ?? '';
    if (!/INDIRECT\("'ELENCO COSTI'!E"/.test(t3)) err('sheet-identity', `${where}!T3 does not read the quantity from ELENCO COSTI`, where);
    if (/CELL\("FILENAME"/i.test(r1) && /costi parz\./.test(t2) && /INDIRECT\("'ELENCO COSTI'!E"/.test(t3)) ok('sheet-identity', `${where} identity formulas intact (R1/T2/T3)`, where);
    // row linkage
    const ecItem = ec.cells.get(EC.cols.item + row)?.v;
    if (ecItem !== item.itemCode) err('elenco-costi', `ELENCO COSTI!B${row} = ${String(ecItem)} (expected ${item.itemCode})`, `'ELENCO COSTI'!B${row}`);
    const ecQty = ec.cells.get(EC.cols.qty + row)?.f ?? '';
    if (ecQty !== `${SHEETS.boq}!I${boqRow}`) err('elenco-costi', `ELENCO COSTI!E${row} is not linked to BOQ!I${boqRow} (found "${ecQty}")`);
    const ecUnit = ec.cells.get(EC.cols.unitCost + row)?.f ?? '';
    if (!/'costi parz\.'!\$BE/.test(ecUnit)) err('elenco-costi', `ELENCO COSTI!J${row} unit-cost formula missing`);
    const ecRef = ec.cells.get(EC.cols.sheetRef + row)?.f ?? '';
    if (!/ROW\(/.test(ecRef)) err('elenco-costi', `ELENCO COSTI!L${row} detail-sheet reference formula missing`);
    if (ecItem === item.itemCode && ecQty === `${SHEETS.boq}!I${boqRow}` && /'costi parz\.'!\$BE/.test(ecUnit)) ok('elenco-costi', `ELENCO COSTI row ${row} written and linked (BOQ!I${boqRow}, costi parz.!BE${row})`, `'ELENCO COSTI'!${row}:${row}`);
    const boqQty = boq.cells.get(BOQ.cols.pcs + boqRow)?.v;
    if (boqQty !== item.quantity) err('boq', `BOQ!I${boqRow} = ${String(boqQty)} (expected ${item.quantity})`);
    else ok('boq', `BOQ row ${boqRow}: quantity ${item.quantity} for ${item.itemCode}`);
    const cpF = cp.cells.get(AGG.costiParz.firstCatCol + row)?.f ?? '';
    const qtF = qt.cells.get(AGG.quantita.firstCatCol + row)?.f ?? '';
    const mdoF = mdo.cells.get(AGG.mdo.firstCol + row)?.f ?? '';
    const indirect = new RegExp(`INDIRECT\\("'" & \\$A${row} & "'!`);
    if (!indirect.test(cpF)) err('aggregation', `costi parz.!G${row} lacks the INDIRECT template formula`);
    if (!/MDO!/.test(qtF) && !indirect.test(qtF)) err('aggregation', `quantità!D${row} lacks the template formula`);
    if (!indirect.test(mdoF)) err('aggregation', `MDO!C${row} lacks the INDIRECT template formula`);
    if (indirect.test(cpF) && indirect.test(mdoF)) ok('aggregation', `costi parz./quantità/MDO row ${row} carry the INDIRECT formulas pointing at sheet '${sheet}'`);
    // dependencies and codes
    const refs = analyseSheetRefs(s);
    for (const dep of refs.dependsOnSheets) {
      if (dep === '#REF!') warnings.push('sheet contains #REF! references inherited from the source');
      else if (!wb.hasSheet(dep)) warnings.push(`references sheet '${dep}' which does not exist in the output (will be #REF!)`);
      else warnings.push(`references sheet '${dep}' of the TEMPLATE workbook, which is a different product`);
    }
    if (refs.hasExternalRefs) warnings.push('sheet references an external workbook');
    const codes = lineItemCodes(s).codes;
    const missingCodes = codes.filter((code) => !priceCodes.has(code));
    if (missingCodes.length) warnings.push(`${missingCodes.length} price-list codes not found in DATI GEN. of the template (VLOOKUP -> #N/A): ${missingCodes.slice(0, 8).join(', ')}${missingCodes.length > 8 ? ', …' : ''}`);
    // values (meaningful only after recalculation)
    const unitCost = recalc.performed ? num(ec.cells.get(EC.cols.unitCost + row)?.v) : null;
    const totalCost = recalc.performed ? num(ec.cells.get(EC.cols.totalCost + row)?.v) : null;
    const sheetUnitCost = recalc.performed ? num(s.cells.get(ANALYSIS.unitCost)?.v) : null;
    if (recalc.performed) {
      if (unitCost === null || sheetUnitCost === null) err('reconciliation', `${where}: unit cost not numeric after recalculation`, where);
      else if (Math.abs(unitCost - Math.round(sheetUnitCost * 10) / 10) > 0.11) err('reconciliation', `ELENCO COSTI!J${row}=${unitCost} differs from ${where}!E67=${sheetUnitCost.toFixed(2)}`, where);
      else ok('reconciliation', `ELENCO COSTI!J${row}=${unitCost} == ROUND(${where}!E67,1)`, where);
      if (unitCost !== null && item.historicalUnitCost !== null) {
        const sameSource = item.sourceWorkbook === project.templateWorkbook && p.paramsWritten.every((w) => item.params.find((x) => x.cell === w.cell)?.original === w.value);
        const diff = Math.abs(unitCost - item.historicalUnitCost);
        if (sameSource && diff > 0.11) warn('historical', `${where}: recalculated unit cost ${unitCost} differs from historical ${item.historicalUnitCost} although source == template and parameters unchanged`, where);
        else if (!sameSource) warn('historical', `${where}: recalculated ${unitCost} vs historical ${item.historicalUnitCost} (different price list or parameters, review)`, where);
        else ok('historical', `${where}: recalculated unit cost ${unitCost} matches historical ${item.historicalUnitCost}`, where);
      }
      if (totalCost !== null) sumOfItems += totalCost;
      else sumKnown = false;
    } else sumKnown = false;
    const errorCells = recalc.performed ? refs.errorCells : 0;
    if (recalc.performed && errorCells) warn('errors', `${where}: ${errorCells} cells with Excel errors after recalculation`, where);
    errorCellsTotal += errorCells;
    items.push({ itemId: item.id, position: item.position, itemCode: item.itemCode, sourceWorkbook: item.sourceWorkbook, sourceSheet: item.sourceSheet ?? '', row, sheet, boqRow, quantity: item.quantity, historicalUnitCost: item.historicalUnitCost, unitCost, sheetUnitCost, totalCost, missingCodes, errorCells, paramsWritten: p.paramsWritten, warnings });
    for (const w of warnings) warn('item', `${item.itemCode} (${where}): ${w}`, where);
    wb.release(sheet);
  }

  const elencoCostiTotal = recalc.performed ? num(ec.cells.get(EC.cols.totalCost + EC.totalRow)?.v) : null;
  if (recalc.performed) {
    if (elencoCostiTotal !== null && sumKnown && Math.abs(elencoCostiTotal - sumOfItems) < 0.05) ok('totals', `ELENCO COSTI!K402 = ${elencoCostiTotal.toFixed(2)} = Σ items`);
    else err('totals', `ELENCO COSTI!K402 = ${String(elencoCostiTotal)} but Σ items = ${sumOfItems.toFixed(2)}`);
  } else warn('recalculation', `Not recalculated (${recalc.detail}); cached values are stale, open the file in Excel to compute costs`);
  if (recalc.performed) ok('recalculation', `Recalculated with ${recalc.method}`);

  const externalLinks = [...new Set(wb.externalLinks.map((e) => e.target))];
  if (externalLinks.length) warn('external-links', `${externalLinks.length} external links inherited from the template (files not available offline): ${externalLinks.map((l) => l.split(/[\\/]/).pop()).join(', ')}`);

  const historicalEstimate = Math.round(project.items.reduce((acc, it) => acc + (it.historicalUnitCost ?? 0) * it.quantity, 0) * 100) / 100;
  const hasError = checks.some((c) => c.level === 'error');
  const status = hasError ? (checks.some((c) => c.level === 'error' && ['sheet', 'elenco-costi', 'aggregation', 'fresh', 'header'].includes(c.check)) ? 'failed' : 'requires_review') : recalc.performed && !checks.some((c) => c.level === 'warning' && c.check !== 'external-links') ? 'validated' : 'requires_review';
  const summary =
    status === 'validated'
      ? `Validated: ${outcome.items.length} analysis sheets, recalculated by Excel, totals reconcile (ELENCO COSTI!K402 = ${elencoCostiTotal?.toFixed(2)}).`
      : status === 'failed'
        ? 'Generation produced a structurally invalid workbook; do not use it.'
        : recalc.performed
          ? 'Workbook recalculated but needs estimator review (see warnings).'
          : 'Draft: structure written and formulas linked, but NOT recalculated (Excel unavailable). Open in Excel: it recalculates on load; then review costs.';
  return {
    status,
    engine,
    generatedAt: new Date().toISOString(),
    projectId: project.id,
    reference: project.reference,
    templateWorkbook: project.templateWorkbook,
    outputFile: outcome.outputFile,
    sheetsCopied: outcome.sheetsCopied,
    sheetsModified: outcome.sheetsModified,
    recalculation: recalc,
    externalLinks,
    items,
    checks,
    totals: { elencoCostiTotal, sumOfItems: sumKnown ? Math.round(sumOfItems * 100) / 100 : null, historicalEstimate },
    errorCellsTotal,
    summary,
  };
}
