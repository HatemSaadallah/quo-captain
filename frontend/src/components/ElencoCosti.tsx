import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, fmtMoney, fmtNum, type ElencoCosti as ElencoCostiData, type Project, type SearchHit } from '../api';

interface Props {
  project: Project;
  onProject: (p: Project) => void;
  onError: (msg: string) => void;
}

const sourceBadge = (s: 'override' | 'historical' | 'none'): string => (s === 'override' ? 'badge warn' : s === 'historical' ? 'badge ok' : 'badge err');

export function ElencoCosti({ project, onProject, onError }: Props) {
  const [sheetData, setData] = useState<ElencoCostiData | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ position: '', itemCode: '', description: '', unit: 'Pcs', quantity: '1', L: '', H: '' });
  const [suggestFor, setSuggestFor] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SearchHit[] | null>(null);

  const activeProject = useRef<string | null>(project.id);
  const suggestionRequest = useRef(0);
  activeProject.current = project.id;
  useEffect(() => {
    activeProject.current = project.id;
    setSuggestFor(null);
    setSuggestions(null);
    return () => { activeProject.current = null; suggestionRequest.current++; };
  }, [project.id]);

  useEffect(() => {
    let active = true;
    api
      .elencoCosti(project.id)
      .then((value) => { if (active) setData(value); })
      .catch((e: unknown) => { if (active) onError(e instanceof Error ? e.message : String(e)); });
    return () => { active = false; };
  }, [project, onError]);

  const guard = async (fn: () => Promise<Project>): Promise<boolean> => {
    try {
      const next = await fn();
      if (activeProject.current !== project.id) return false;
      onProject(next);
      return true;
    } catch (e) {
      if (activeProject.current === project.id) onError(e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  const addRow = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const saved = await guard(() =>
      api.addRow(project.id, {
        position: draft.position,
        itemCode: draft.itemCode,
        description: draft.description,
        unit: draft.unit,
        quantity: Number(draft.quantity),
        L: draft.L === '' ? null : Number(draft.L),
        H: draft.H === '' ? null : Number(draft.H),
      }),
    );
    if (!saved) return;
    setAdding(false);
    setDraft({ position: '', itemCode: '', description: '', unit: 'Pcs', quantity: '1', L: '', H: '' });
  };

  const suggest = async (itemId: string): Promise<void> => {
    const request = ++suggestionRequest.current;
    setSuggestFor(itemId);
    setSuggestions(null);
    try {
      const next = await api.suggestions(project.id, itemId, 6);
      if (request === suggestionRequest.current && activeProject.current === project.id) setSuggestions(next);
    } catch (e) {
      if (request !== suggestionRequest.current || activeProject.current !== project.id) return;
      onError(e instanceof Error ? e.message : String(e));
      setSuggestFor(null);
    }
  };

  const attach = async (itemId: string, tabId: string): Promise<void> => {
    const request = suggestionRequest.current;
    const saved = await guard(() => api.attach(project.id, itemId, tabId));
    if (saved && request === suggestionRequest.current) {
      setSuggestFor(null);
      setSuggestions(null);
    }
  };

  const data = sheetData?.projectId === project.id ? sheetData : null;
  if (!data) return <section className="panel muted">Computing ELENCO COSTI…</section>;

  return (
    <section className="panel sheet">
      <h2>
        ELENCO COSTI
        <span className="muted small">
          Offer n° {data.reference} · {project.customer} · {project.name}
        </span>
      </h2>
      <table className="data elenco">
        <thead>
          <tr>
            <th>Pos.</th>
            <th>Item</th>
            <th>DESCRIPTION</th>
            <th>M.U.</th>
            <th className="num">Q.ty</th>
            <th className="num">L (mm)</th>
            <th className="num">H (mm)</th>
            <th className="num">m² unit</th>
            <th className="num">m² total</th>
            <th className="num">Unit Cost €</th>
            <th className="num">Total Cost €</th>
            <th>Detail sheet Ref.</th>
            <th>Lotto</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.itemId} data-testid={`row-${r.itemId}`}>
              <td>{r.position}</td>
              <td>{r.itemCode}</td>
              <td style={{ minWidth: 220 }} title={r.description}>
                {r.description.split(/\r?\n/)[0]}
                {r.warnings.length > 0 && (
                  <ul className="issues small">
                    {r.warnings.map((w, i) => (
                      <li key={i} className={r.unitCostSource === 'none' ? 'error' : 'warning'}>
                        {w}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td>{r.unit}</td>
              <td className="num">{fmtNum(r.quantity, 3)}</td>
              <td className="num">{fmtNum(r.L)}</td>
              <td className="num">{fmtNum(r.H)}</td>
              <td className="num">{fmtNum(r.m2Unit, 3)}</td>
              <td className="num">{fmtNum(r.m2Total, 3)}</td>
              <td className="num">
                <div>{r.unitCost === null ? <span className="badge err">missing</span> : fmtMoney(r.unitCost)}</div>
                <div className="small">
                  <span className={sourceBadge(r.unitCostSource)} title={r.historicalUnitCost !== null ? `historical ${fmtMoney(r.historicalUnitCost)}` : ''}>
                    {r.unitCostSource}
                  </span>
                </div>
                <input
                  className="narrow"
                  type="number"
                  step="any"
                  min={0}
                  placeholder="override"
                  aria-label={`override unit cost ${r.itemCode || r.line}`}
                  defaultValue={r.unitCostOverride ?? ''}
                  key={r.itemId + String(r.unitCostOverride)}
                  onBlur={(e) => {
                    const v = e.target.value === '' ? null : Number(e.target.value);
                    if (v !== r.unitCostOverride) void guard(() => api.updateItem(project.id, r.itemId, { unitCostOverride: v }));
                  }}
                />
              </td>
              <td className="num">{r.totalCost === null ? '—' : fmtMoney(r.totalCost)}</td>
              <td className="small">
                {r.tab ? (
                  <>
                    <span className="chip">{r.tab.offerNo ?? r.tab.workbook}</span> sheet <b>{r.tab.sheet}</b>
                    {r.tab.unit && <span> · source unit {r.tab.unit}</span>}
                    <div>
                      <button onClick={() => void suggest(r.itemId)} style={{ padding: '1px 6px' }}>
                        change
                      </button>{' '}
                      <button onClick={() => void guard(() => api.detach(project.id, r.itemId))} style={{ padding: '1px 6px' }}>
                        detach
                      </button>
                    </div>
                  </>
                ) : (
                  <button className="primary" onClick={() => void suggest(r.itemId)} style={{ padding: '2px 8px' }}>
                    Attach by similarity
                  </button>
                )}
                {suggestFor === r.itemId && (
                  <div className="suggestions">
                    {suggestions === null && <span className="muted">searching similar analyses…</span>}
                    {suggestions?.length === 0 && <span className="muted">no similar analysis found</span>}
                    {suggestions?.map((h) => (
                      <button key={h.record.id} onClick={() => void attach(r.itemId, h.record.id)} title={h.record.description ?? ''}>
                        {Math.round(h.score * 100)}% · {h.record.title} <span className="muted">· {h.record.offerNo ?? h.record.workbook} sheet {h.record.sheet} · {fmtMoney(h.record.unitCost)}</span>
                      </button>
                    ))}
                    <button onClick={() => setSuggestFor(null)} style={{ padding: '1px 6px' }}>
                      close
                    </button>
                  </div>
                )}
              </td>
              <td>{r.lotto ?? ''}</td>
              <td>
                <button className="danger" onClick={() => void guard(() => api.removeItem(project.id, r.itemId))} title="remove row">
                  ×
                </button>
              </td>
            </tr>
          ))}
          <tr className="total">
            <td colSpan={8}>TOTAL COST</td>
            <td className="num">{fmtNum(data.totals.m2Total, 2)} m²</td>
            <td />
            <td className="num">
              <b>{fmtMoney(data.totals.totalCost)}</b>
              {!data.totals.complete && <div className="small" style={{ color: 'var(--err)' }}>{data.totals.rowsWithoutCost} row(s) without unit cost</div>}
            </td>
            <td colSpan={3} />
          </tr>
        </tbody>
      </table>

      {adding ? (
        <form className="grid2" onSubmit={(e) => void addRow(e)} style={{ marginTop: 10 }} aria-label="new row">
          <label className="field">
            Pos.<input value={draft.position} onChange={(e) => setDraft({ ...draft, position: e.target.value })} placeholder="04" />
          </label>
          <label className="field">
            Item<input value={draft.itemCode} onChange={(e) => setDraft({ ...draft, itemCode: e.target.value })} placeholder="04-01" />
          </label>
          <label className="field" style={{ gridColumn: '1 / span 2' }}>
            Description *<textarea required value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Glass balustrade on aluminium balcony, H 1130 mm" />
          </label>
          <label className="field">
            M.U.<input value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
          </label>
          <label className="field">
            Q.ty *<input type="number" step="any" min={0.001} required value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} />
          </label>
          <label className="field">
            L (mm)<input type="number" step="any" value={draft.L} onChange={(e) => setDraft({ ...draft, L: e.target.value })} />
          </label>
          <label className="field">
            H (mm)<input type="number" step="any" value={draft.H} onChange={(e) => setDraft({ ...draft, H: e.target.value })} />
          </label>
          <div className="row">
            <button className="primary" type="submit">
              Add row
            </button>
            <button type="button" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={() => setAdding(true)}>+ Add row from BOQ</button>
          <span className="muted small">Type the customer's line; then attach the most similar historical analysis to get its unit cost.</span>
        </div>
      )}

      <h3>Summary by position</h3>
      <table className="data">
        <thead>
          <tr>
            <th>POS</th>
            <th className="num">rows</th>
            <th className="num">m²</th>
            <th className="num">Unit Cost €/m²</th>
            <th className="num">Total Cost €</th>
          </tr>
        </thead>
        <tbody>
          {data.summary.map((s) => (
            <tr key={s.position}>
              <td>{s.position}</td>
              <td className="num">{s.rows}</td>
              <td className="num">{fmtNum(s.m2Total, 2)}</td>
              <td className="num">{s.unitCost === null ? '—' : fmtMoney(s.unitCost)}</td>
              <td className="num">{fmtMoney(s.totalCost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details className="small muted" style={{ marginTop: 8 }}>
        <summary>Formulas (as in the sheet)</summary>
        <ul>
          {Object.entries(data.formulas).map(([k, v]) => (
            <li key={k}>
              <b>{k}</b>: <code>{v}</code>
            </li>
          ))}
        </ul>
        <p>{data.note}</p>
      </details>
    </section>
  );
}
