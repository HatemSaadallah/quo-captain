/**
 * Builds the web workbook: the ELENCO COSTI sheet laid out like the original (same columns and
 * formulas, rows starting at 6) and one evaluated analysis sheet per cost row.
 */
import type { ElencoCosti, Project, ProjectItem } from '../../common/interfaces/project.interface';
import type { GridCell, GridSheet } from '../../common/interfaces/workbook-view.interface';
import type { Value } from '../../common/utils/formula-engine';
import { ExcelError } from '../../common/utils/formula-engine';
import { EC } from '../../excel/somec-schema';

const EC_COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];

export function elencoCostiSheet(project: Project, ec: ElencoCosti): GridSheet {
  const cells: GridCell[] = [];
  const header: Record<string, string> = { A: 'Pos.', B: 'Item', C: 'DESCRIPTION', D: 'M.U.', E: 'Q.ty', F: 'L (mm)', G: 'H (mm)', H: 'm² unit', I: 'm² total', J: 'Unit Cost €', K: 'Total Cost €', L: 'Detail sheet', M: 'Lotto' };
  cells.push({ addr: 'A1', v: 'Offer N°:', kind: 'label' }, { addr: 'C1', v: project.reference, kind: 'formula', f: "'DATI GEN.'!$C$5", source: 'project' }, { addr: 'D1', v: 'Date:', kind: 'label' }, { addr: 'E1', v: project.date, kind: 'formula', f: "'DATI GEN.'!$C$6", source: 'project' }, { addr: 'F1', v: 'Client:', kind: 'label' }, { addr: 'G1', v: project.customer, kind: 'formula', f: "'DATI GEN.'!$C$7", source: 'project' }, { addr: 'I1', v: 'Project:', kind: 'label' }, { addr: 'J1', v: project.name, kind: 'formula', f: "'DATI GEN.'!$C$8", source: 'project' });
  for (const [c, h] of Object.entries(header)) cells.push({ addr: `${c}${EC.headerRow}`, v: h, kind: 'header' });
  const rowOf = new Map<string, number>();
  ec.rows.forEach((r, i) => {
    const row = EC.firstRow + i;
    rowOf.set(r.itemId, row);
    const item = project.items.find((it) => it.id === r.itemId) as ProjectItem;
    const edit = (field: NonNullable<GridCell['edit']>['field']): GridCell['edit'] => ({ itemId: r.itemId, field });
    cells.push(
      { addr: `A${row}`, v: r.position, kind: 'input', edit: edit('position') },
      { addr: `B${row}`, v: r.itemCode, kind: 'input', edit: edit('itemCode') },
      { addr: `C${row}`, v: r.description, kind: 'input', edit: edit('description') },
      { addr: `D${row}`, v: r.unit, kind: 'input', edit: edit('unit') },
      { addr: `E${row}`, v: r.quantity, kind: 'input', f: `BOQ!I${row + 2}`, edit: edit('quantity'), source: 'project (BOQ quantity)' },
      { addr: `F${row}`, v: r.L, kind: 'input', edit: edit('L') },
      { addr: `G${row}`, v: r.H, kind: 'input', edit: edit('H') },
      { addr: `H${row}`, v: r.m2Unit, kind: 'formula', f: `IF(AND(D${row}="m",G${row}<>0),G${row}/1000,G${row}*F${row}/1000000)` },
      { addr: `I${row}`, v: r.m2Total, kind: 'formula', f: `IF(D${row}="m²",E${row},H${row}*E${row})` },
      {
        addr: `J${row}`,
        v: r.unitCost,
        kind: r.unitCostSource === 'override' ? 'input' : 'formula',
        f: r.unitCostSource === 'override' ? undefined : `ROUND('costi parz.'!$BE${row},1)`,
        edit: edit('unitCostOverride'),
        source: r.tab ? `${r.unitCostSource}: ${r.tab.offerNo ?? r.tab.workbook} sheet ${r.tab.sheet}` : r.unitCostSource,
        ...(r.unitCost === null ? { err: 'missing' } : {}),
      },
      { addr: `K${row}`, v: r.totalCost, kind: 'formula', f: `J${row}*E${row}` },
      { addr: `L${row}`, v: r.tab ? `'${row}' ← ${r.tab.offerNo ?? r.tab.workbook} / ${r.tab.sheet}` : null, kind: 'formula', f: `IF(B${row}="",0,ROW(B${row}))` },
      { addr: `M${row}`, v: r.lotto, kind: 'input' },
    );
    void item;
  });
  const totalRow = EC.firstRow + ec.rows.length + 1;
  cells.push({ addr: `A${totalRow}`, v: 'TOTAL COST', kind: 'total' }, { addr: `I${totalRow}`, v: ec.totals.m2Total, kind: 'total', f: `SUM(I${EC.firstRow}:I${totalRow - 2})` }, { addr: `K${totalRow}`, v: ec.totals.totalCost, kind: 'total', f: `SUM(K${EC.firstRow}:K${totalRow - 1})` });
  let r = totalRow + 3;
  cells.push({ addr: `A${r}`, v: 'POS', kind: 'header' }, { addr: `C${r}`, v: 'SUMMARY', kind: 'header' }, { addr: `I${r}`, v: 'm²', kind: 'header' }, { addr: `J${r}`, v: 'Unit Cost €', kind: 'header' }, { addr: `K${r}`, v: 'Total Cost €', kind: 'header' });
  for (const s of ec.summary) {
    r++;
    cells.push({ addr: `A${r}`, v: s.position, kind: 'label' }, { addr: `I${r}`, v: s.m2Total, kind: 'formula', f: `SUMIF($A$${EC.firstRow}:$A$${totalRow - 1},$A${r},I$${EC.firstRow}:I$${totalRow - 1})` }, { addr: `J${r}`, v: s.unitCost, kind: 'formula', f: `IF(I${r}=0,0,K${r}/I${r})` }, { addr: `K${r}`, v: s.totalCost, kind: 'formula', f: `SUMIF($A$${EC.firstRow}:$A$${totalRow - 1},$A${r},K$${EC.firstRow}:K$${totalRow - 1})` });
  }
  const rows: number[] = [1, EC.headerRow];
  for (let i = EC.firstRow; i <= r; i++) if (cells.some((c) => c.addr.endsWith(String(i)) && /^[A-Z]+\d+$/.test(c.addr) && Number(c.addr.replace(/^[A-Z]+/, '')) === i)) rows.push(i);
  return { name: 'ELENCO COSTI', kind: 'elenco', cols: EC_COLS, rows, cells, widths: { A: 5, B: 7, C: 48, D: 5, E: 7, F: 7, G: 7, H: 8, I: 9, J: 11, K: 13, L: 22, M: 7 }, note: ec.note };
}

const toGridValue = (v: Value): { v: GridCell['v']; err?: string } => (v instanceof ExcelError ? { v: v.code, err: v.code } : { v });

export function analysisSheet(item: ProjectItem, row: number, grid: { cells: Array<{ addr: string; v: Value; f?: string }>; maxRow: number }, title: string): GridSheet {
  const cells: GridCell[] = [];
  const rowsSet = new Set<number>();
  const colsSet = new Set<string>();
  const paramCells = new Set(item.params.map((p) => p.cell));
  for (const c of grid.cells) {
    const m = /^([A-Z]+)(\d+)$/.exec(c.addr)!;
    const r = Number(m[2]);
    const gv = toGridValue(c.v);
    const isParam = paramCells.has(c.addr);
    const cell: GridCell = { addr: c.addr, v: gv.v, kind: c.f ? 'formula' : isParam ? 'input' : typeof gv.v === 'string' ? 'label' : 'input', ...(c.f ? { f: c.f } : {}), ...(gv.err ? { err: gv.err } : {}) };
    if (isParam) cell.edit = { itemId: item.id, field: 'param', cell: c.addr };
    if (c.addr === 'T3') cell.source = 'project quantity';
    if (/^[DGHRS]\d+$/.test(c.addr) && c.f && /DATI GEN/.test(c.f)) cell.source = `${item.sourceWorkbook} price list`;
    cells.push(cell);
    rowsSet.add(r);
    colsSet.add(m[1]);
  }
  const cols = [...colsSet].sort((a, b) => a.length - b.length || a.localeCompare(b));
  const rows = [...rowsSet].sort((a, b) => a - b);
  return { name: String(row), kind: 'analysis', itemId: item.id, title, cols, rows, cells, widths: { B: 34, C: 10, D: 9, J: 26, K: 8, P: 24 }, note: `Evaluated from the stored logic of ${item.sourceOfferNo ?? item.sourceWorkbook} sheet ${item.sourceSheet} with this project's quantity (${item.quantity}) and parameters; price list of ${item.sourceWorkbook}.` };
}
