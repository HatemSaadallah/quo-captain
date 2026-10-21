/**
 * Extracts the calculation logic of a workbook into storable form: the cell maps of
 * every analysis tab (inputs + formulas) and value snapshots of the sheets they read.
 * Also runs the fidelity check (app engine vs Excel's cached unit cost) per tab.
 */
import type { StoredCell, SheetSnapshot, WorkbookSnapshots } from './sheet-evaluator';
import { XlsxWorkbook } from '../common/utils/xlsx-reader';
import { SheetEvaluator, inputsForRow, snapshotFromStored, toStoredCells } from './sheet-evaluator';
import { EC, SHEETS, isAnalysisSheetName } from './somec-schema';

export const EXTERNAL_SHEETS: string[] = [SHEETS.datiGen, SHEETS.bdgCosti, SHEETS.indiretti, SHEETS.elencoCosti, SHEETS.costiParz];

export type Fidelity = 'exact' | 'off' | 'n/a';

export interface TabLogic {
  sheet: string;
  row: number;
  cells: StoredCell[];
  computedUnitCost: number | null;
  cachedUnitCost: number | null;
  fidelity: Fidelity;
  errors: number;
  unsupported: number;
}

export interface WorkbookLogic {
  workbook: string;
  snapshots: Record<string, StoredCell[]>;
  tabs: TabLogic[];
}

export async function extractWorkbookLogic(filePath: string, workbookName: string): Promise<WorkbookLogic> {
  const wb = await XlsxWorkbook.open(filePath);
  const snapshots: Record<string, StoredCell[]> = {};
  const sheets = new Map<string, SheetSnapshot>();
  for (const name of EXTERNAL_SHEETS) {
    if (!wb.hasSheet(name)) continue;
    const stored = toStoredCells((await wb.sheet(name)).cells);
    snapshots[name] = stored;
    sheets.set(name, snapshotFromStored(stored));
    wb.release(name);
  }
  const tabNames = wb.sheetNames.filter(isAnalysisSheetName);
  const storedTabs = new Map<string, StoredCell[]>();
  for (const name of tabNames) {
    const stored = toStoredCells((await wb.sheet(name)).cells);
    storedTabs.set(name, stored);
    sheets.set(name, snapshotFromStored(stored));
    wb.release(name);
  }
  const ws: WorkbookSnapshots = { sheets, fileName: workbookName };
  const ec = sheets.get(SHEETS.elencoCosti);
  const tabs: TabLogic[] = [];
  for (const name of tabNames) {
    const row = Number(name);
    const snap = sheets.get(name)!;
    const cached = snap.cells.get('E67')?.v;
    const cachedUnitCost = typeof cached === 'number' ? cached : null;
    let computedUnitCost: number | null = null;
    let fidelity: Fidelity = 'n/a';
    let errors = 0;
    let unsupported = 0;
    const hasItem = ec?.cells.get(EC.cols.item + row)?.v;
    if (hasItem) {
      try {
        const res = new SheetEvaluator(name, snap, ws, inputsForRow(ws, row), row).evaluate();
        computedUnitCost = res.unitCost;
        errors = Object.keys(res.errors).length;
        unsupported = Object.keys(res.unsupported).length;
        if (computedUnitCost !== null && cachedUnitCost !== null) fidelity = Math.abs(computedUnitCost - cachedUnitCost) <= 0.011 ? 'exact' : 'off';
      } catch {
        fidelity = 'off';
      }
    }
    tabs.push({ sheet: name, row, cells: storedTabs.get(name)!, computedUnitCost, cachedUnitCost, fidelity, errors, unsupported });
  }
  return { workbook: workbookName, snapshots, tabs };
}
