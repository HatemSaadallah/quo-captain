import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { INPUT_DIR } from '../common/utils/paths';
import { extractWorkbookLogic, type WorkbookLogic } from './logic-extractor';
import { SheetEvaluator, inputsForRow, snapshotFromStored, type SheetSnapshot, type WorkbookSnapshots } from './sheet-evaluator';

describe('app-side cost engine on TM1643-06 (logic extracted from the workbook)', () => {
  let logic: WorkbookLogic;
  let ws: WorkbookSnapshots;
  beforeAll(async () => {
    logic = await extractWorkbookLogic(path.join(INPUT_DIR, 'TM1643-06 Analisi.xlsx'), 'TM1643-06 Analisi.xlsx');
    const sheets = new Map<string, SheetSnapshot>();
    for (const [s, cells] of Object.entries(logic.snapshots)) sheets.set(s, snapshotFromStored(cells));
    for (const t of logic.tabs) sheets.set(t.sheet, snapshotFromStored(t.cells));
    ws = { sheets, fileName: 'TM1643-06 Analisi.xlsx' };
  });

  it('reproduces Excel unit costs on the balcony tabs with the historical inputs', () => {
    const exact = logic.tabs.filter((t) => t.fidelity === 'exact').length;
    const checked = logic.tabs.filter((t) => t.fidelity !== 'n/a').length;
    expect(checked).toBeGreaterThan(80);
    expect(exact / checked).toBeGreaterThan(0.95);
    const t10 = logic.tabs.find((t) => t.sheet === '10')!;
    expect(t10.computedUnitCost).toBeCloseTo(1090.74, 2);
    expect(t10.cachedUnitCost).toBeCloseTo(1090.74, 2);
  });

  it('recomputes the unit cost when the project quantity or a parameter changes', () => {
    const snap = ws.sheets.get('10')!;
    const base = inputsForRow(ws, 10);
    const same = new SheetEvaluator('10', snap, ws, base, 10).evaluate();
    expect(same.unitCost).toBeCloseTo(1090.74, 2);
    const fewer = new SheetEvaluator('10', snap, ws, { ...base, quantity: 50 }, 10).evaluate();
    expect(fewer.unitCost).not.toBeNull();
    expect(fewer.unitCost!).toBeGreaterThan(1090.74); // fixed engineering/management costs spread over 50 instead of 712 pieces
    const deeper = new SheetEvaluator('10', snap, ws, { ...base, overrides: { N4: 1700 } }, 10).evaluate();
    expect(deeper.unitCost!).toBeGreaterThan(same.unitCost!); // deeper balcony: more floor material
    expect(deeper.breakdown.some((b) => b.category === 'ALUPRO' && b.total! > 0)).toBe(true);
    expect(Object.keys(same.unsupported)).toEqual([]);
  });
});
