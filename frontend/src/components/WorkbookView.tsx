import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { api, type GridCell, type GridSheet, type Quotation, type WorkbookView as WorkbookData } from '../api';
import { Benchmark } from './Benchmark';

interface Props {
  quotation: Quotation;
  onQuotation: (p: Quotation) => void;
  onError: (msg: string) => void;
}

const fmt = (v: GridCell['v']): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) && Math.abs(v) < 10000 ? String(v) : v.toLocaleString('it-IT', { maximumFractionDigits: 2 });
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return v;
};

export function WorkbookView({ quotation, onQuotation, onError }: Props) {
  const [wb, setWb] = useState<WorkbookData | null>(null);
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState<GridCell | null>(null);
  const [editing, setEditing] = useState<{ cell: GridCell; draft: string } | null>(null);

  useEffect(() => {
    const quotationId = quotation.id;
    api
      .workbook(quotationId)
      .then((w) => {
        if (w.quotationId === quotationId) setWb(w);
      })
      .catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)));
  }, [quotation, onError]);

  const sheet: GridSheet | undefined = wb?.sheets[Math.min(active, (wb?.sheets.length ?? 1) - 1)];
  const cellMap = useMemo(() => {
    const m = new Map<string, GridCell>();
    for (const c of sheet?.cells ?? []) m.set(c.addr, c);
    return m;
  }, [sheet]);

  const commit = async (): Promise<void> => {
    if (!editing) return;
    const { cell, draft } = editing;
    setEditing(null);
    if (!cell.edit) return;
    const num = draft.trim() === '' ? null : Number(draft);
    try {
      let p: Quotation;
      switch (cell.edit.field) {
        case 'quantity':
          p = await api.updateItem(quotation.id, cell.edit.itemId, { quantity: Number(draft) });
          break;
        case 'unitCostOverride':
          p = await api.updateItem(quotation.id, cell.edit.itemId, { unitCostOverride: num });
          break;
        case 'param':
          p = await api.updateItem(quotation.id, cell.edit.itemId, { params: [{ cell: cell.edit.cell ?? cell.addr, value: num }] });
          break;
        case 'L':
        case 'H':
          p = await api.updateItem(quotation.id, cell.edit.itemId, { [cell.edit.field]: num });
          break;
        default:
          p = await api.updateItem(quotation.id, cell.edit.itemId, { [cell.edit.field]: draft });
      }
      onQuotation(p);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') void commit();
    if (e.key === 'Escape') setEditing(null);
  };

  if (!wb || !sheet) return <section className="panel muted">Generating the web workbook…</section>;
  const selectedItemId = selected?.edit?.itemId ?? (sheet.kind === 'analysis' ? sheet.itemId : undefined);

  return (
    <section className="panel workbook">
      <div className="row toolbar">
        <h2 style={{ margin: 0 }}>
          Generated quotation <span className="muted small">{wb.reference} · web workbook, clickable like Excel</span>
        </h2>
        <span style={{ flex: 1 }} />
        <button onClick={() => void api.downloadWorkbookXlsx(quotation.id, quotation.reference).catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)))}>Download Excel</button>
        <button onClick={() => window.print()}>Print</button>
      </div>
      <div className="formula-bar">
        <span className="addr">{selected?.addr ?? ''}</span>
        <span className="fx">fx</span>
        <span className="formula" title={selected?.f ? `=${selected.f}` : ''}>
          {selected ? (selected.f ? `=${selected.f}` : fmt(selected.v)) : 'click a cell'}
        </span>
        {selected?.f && <span className="muted small">= {fmt(selected.v)}</span>}
        {selected?.source && <span className="chip">{selected.source}</span>}
        {selected?.edit && <span className="chip">editable (double-click)</span>}
      </div>
      <div className="grid-wrap">
        <table className="grid" data-testid={`sheet-${sheet.name}`}>
          <thead>
            <tr>
              <th className="rn" />
              {sheet.cols.map((c) => (
                <th key={c} style={{ minWidth: (sheet.widths?.[c] ?? 9) * 7 }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((r) => (
              <tr key={r}>
                <th className="rn">{r}</th>
                {sheet.cols.map((c) => {
                  const cell = cellMap.get(`${c}${r}`);
                  const isSel = selected?.addr === `${c}${r}`;
                  const isEdit = editing?.cell.addr === `${c}${r}`;
                  return (
                    <td
                      key={c}
                      className={`cell ${cell?.kind ?? 'empty'} ${isSel ? 'selected' : ''} ${cell?.err ? 'error' : ''} ${typeof cell?.v === 'number' ? 'num' : ''}`}
                      onClick={() => cell && setSelected(cell)}
                      onDoubleClick={() => cell?.edit && setEditing({ cell, draft: cell.v === null ? '' : String(cell.v) })}
                      title={cell?.f ? `=${cell.f}` : undefined}
                    >
                      {isEdit ? (
                        <input autoFocus aria-label={`edit ${cell!.addr}`} value={editing!.draft} onChange={(e) => setEditing({ cell: cell!, draft: e.target.value })} onBlur={() => void commit()} onKeyDown={onKey} />
                      ) : (
                        fmt(cell?.v ?? null)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sheet-tabs" role="tablist">
        {wb.sheets.map((s, i) => (
          <button key={s.name} role="tab" aria-selected={i === active} className={i === active ? 'active' : ''} onClick={() => { setActive(i); setSelected(null); }} title={s.title ?? s.name}>
            {s.name}
          </button>
        ))}
      </div>
      {sheet.note && <div className="small muted">{sheet.note}</div>}
      {selectedItemId && <Benchmark quotationId={quotation.id} itemId={selectedItemId} onError={onError} />}
    </section>
  );
}
