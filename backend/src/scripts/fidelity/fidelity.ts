/**
 * Fidelity check of the app-side cost engine: every reference tab of every workbook is
 * re-evaluated from its own cells + the workbook's external snapshots with its original
 * inputs, and the computed unit cost (E67) is compared with Excel's cached E67.
 * Usage: npx tsx src/scripts/fidelity/fidelity.ts [workbook-substring] [--verbose]
 */
import path from 'node:path';
import { INPUT_DIR } from '../../common/utils/paths';
import { XlsxWorkbook } from '../../common/utils/xlsx-reader';
import type { Value } from '../../common/utils/formula-engine';
import { KNOWN_WORKBOOKS, SHEETS, EC, isAnalysisSheetName } from '../../excel/somec-schema';
import { SheetEvaluator, snapshotFromStored, toStoredCells, type SheetSnapshot, type WorkbookSnapshots } from '../../excel/sheet-evaluator';

const EXTERNAL = [SHEETS.datiGen, SHEETS.bdgCosti, SHEETS.indiretti, SHEETS.elencoCosti, SHEETS.costiParz];

async function main(): Promise<void> {
  const filter = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '';
  const verbose = process.argv.includes('--verbose');
  let total = 0;
  let exact = 0;
  let close = 0;
  let off = 0;
  let failed = 0;
  const worst: string[] = [];
  for (const w of KNOWN_WORKBOOKS.filter((x) => x.includes(filter))) {
    const t0 = Date.now();
    const wb = await XlsxWorkbook.open(path.join(INPUT_DIR, w));
    const sheets = new Map<string, SheetSnapshot>();
    for (const name of EXTERNAL) if (wb.hasSheet(name)) sheets.set(name, snapshotFromStored(toStoredCells((await wb.sheet(name)).cells)));
    const tabNames = wb.sheetNames.filter(isAnalysisSheetName);
    for (const name of tabNames) sheets.set(name, snapshotFromStored(toStoredCells((await wb.sheet(name)).cells)));
    const snapshots: WorkbookSnapshots = { sheets, fileName: w };
    const ec = sheets.get(SHEETS.elencoCosti)!;
    const val = (addr: string): Value => ec.cells.get(addr)?.v ?? null;
    let wbTotal = 0;
    let wbOk = 0;
    for (const name of tabNames) {
      const row = Number(name);
      const itemCode = val(EC.cols.item + row);
      if (!itemCode) continue; // orphan tab, no item row
      const snap = sheets.get(name)!;
      const cachedUnit = snap.cells.get('E67')?.v;
      const quantity = val(EC.cols.qty + row);
      const inputs = { quantity: typeof quantity === 'number' ? quantity : 0, itemCode: String(itemCode), description: String(val(EC.cols.description + row) ?? ''), unit: String(val(EC.cols.unit + row) ?? ''), lotto: (val(EC.cols.lotto + row) as string | null) ?? null, overrides: {} };
      total++;
      wbTotal++;
      let line = '';
      try {
        const res = new SheetEvaluator(name, snap, snapshots, inputs, row).evaluate();
        const got = res.unitCost;
        const want = typeof cachedUnit === 'number' ? cachedUnit : null;
        const diff = got !== null && want !== null ? Math.abs(got - want) : null;
        const rel = diff !== null && want ? diff / Math.abs(want) : null;
        if (diff !== null && diff <= 0.011) {
          exact++;
          wbOk++;
        } else if (rel !== null && rel <= 0.001) {
          close++;
          wbOk++;
        } else off++;
        line = `${w} '${name}' ${String(itemCode).padEnd(8)} cached=${want === null ? 'n/a' : want.toFixed(2)} computed=${got === null ? 'n/a' : got.toFixed(2)} errors=${Object.keys(res.errors).length} unsupported=${Object.keys(res.unsupported).length} cells=${res.evaluatedCells} ${res.ms}ms`;
        if (diff === null || diff > 0.011) worst.push(line + (Object.keys(res.unsupported).length ? ` | first unsupported: ${Object.entries(res.unsupported)[0].join(': ').slice(0, 160)}` : ''));
      } catch (e) {
        failed++;
        line = `${w} '${name}' FAILED: ${e instanceof Error ? e.message : String(e)}`;
        worst.push(line);
      }
      if (verbose) console.log(line);
      wb.release(name);
    }
    console.log(`${w}: ${wbOk}/${wbTotal} tabs reproduce Excel's unit cost (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
  console.log(`\nTOTAL ${total} tabs: exact(≤0.01€) ${exact}, close(≤0.1%) ${close}, off ${off}, failed ${failed}`);
  for (const l of worst.slice(0, 25)) console.log('  ' + l);
}

void main();
