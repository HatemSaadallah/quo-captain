import { useEffect, useState, type FormEvent } from 'react';
import { api, fmtMoney, fmtNum, type ElencoCosti as ElencoCostiData, type Quotation, type SearchHit } from '../api';

interface Props {
  quotation: Quotation;
  onQuotation: (p: Quotation) => void;
  onError: (msg: string) => void;
}

const sourceBadge = (s: 'override' | 'computed' | 'historical' | 'none'): string => (s === 'override' ? 'badge warn' : s === 'computed' ? 'badge ok' : s === 'historical' ? 'badge' : 'badge err');

export function ElencoCosti({ quotation, onQuotation, onError }: Props) {
  const [data, setData] = useState<ElencoCostiData | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ position: '', itemCode: '', description: '', unit: 'Pcs', quantity: '1', L: '', H: '' });
  const [suggestFor, setSuggestFor] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SearchHit[] | null>(null);

  useEffect(() => {
    api
      .elencoCosti(quotation.id)
      .then(setData)
      .catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)));
  }, [quotation, onError]);

  const guard = async (fn: () => Promise<Quotation>): Promise<void> => {
    try {
      onQuotation(await fn());
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const addRow = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    await guard(() =>
      api.addRow(quotation.id, {
        position: draft.position,
        itemCode: draft.itemCode,
        description: draft.description,
        unit: draft.unit,
        quantity: Number(draft.quantity),
        L: draft.L === '' ? null : Number(draft.L),
        H: draft.H === '' ? null : Number(draft.H),
      }),
    );
    setAdding(false);
    setDraft({ position: '', itemCode: '', description: '', unit: 'Pcs', quantity: '1', L: '', H: '' });
  };

  const suggest = async (itemId: string): Promise<void> => {
    setSuggestFor(itemId);
    setSuggestions(null);
    try {
      setSuggestions(await api.suggestions(quotation.id, itemId, 6));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      setSuggestFor(null);
    }
  };

  const attach = async (itemId: string, tabId: string): Promise<void> => {
    await guard(() => api.attach(quotation.id, itemId, tabId));
    setSuggestFor(null);
    setSuggestions(null);
  };

  if (!data) return <section className="panel muted">Computing ELENCO COSTI…</section>;

  return (
    <section className="panel sheet">
      <h2>
        ELENCO COSTI
        <span className="muted small">
          Offer n° {data.reference} · {quotation.customer} · {quotation.name}
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
                  <ul className="issues small" hidden>
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
                    if (v !== r.unitCostOverride) void guard(() => api.updateItem(quotation.id, r.itemId, { unitCostOverride: v }));
                  }}
                />
              </td>
              <td className="num">{r.totalCost === null ? '—' : fmtMoney(r.totalCost)}</td>
              <td className="small">
                {r.tab ? (
                  <>
                    <span className="chip">{r.tab.offerNo ?? r.tab.workbook}</span> sheet <b>{r.tab.sheet}</b>
                    <div>
                      <button onClick={() => void suggest(r.itemId)} style={{ padding: '1px 6px' }}>
                        change
                      </button>{' '}
                      <button onClick={() => void guard(() => api.detach(quotation.id, r.itemId))} style={{ padding: '1px 6px' }}>
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
                <button className="danger" onClick={() => void guard(() => api.removeItem(quotation.id, r.itemId))} title="remove row">
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
