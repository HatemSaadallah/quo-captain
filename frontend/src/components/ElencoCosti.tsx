import { useEffect, useState, type FormEvent } from 'react';
import { api, fmtMaterialQty, fmtMoney, fmtNum, type ElencoCosti as ElencoCostiData, type ProductMaterial, type Quotation, type SearchHit } from '../api';
import { imageOf, typologyOf } from '../product';
import '../quotation.css';

interface Props {
  quotation: Quotation;
  onQuotation: (p: Quotation) => void;
  onError: (msg: string) => void;
  /** Reports the computed sheet upward so the page header shows the same total as the table. */
  onData?: (data: ElencoCostiData) => void;
}

type Row = ElencoCostiData['rows'][number];

const SOURCE: Record<Row['unitCostSource'], { label: string; hint: string }> = {
  computed: { label: 'Recalculated', hint: 'Recalculated from the historical analysis for this quantity and size' },
  historical: { label: 'Historical', hint: 'Unit cost as it was in the original offer' },
  override: { label: 'Manual price', hint: 'Unit cost entered by hand' },
  none: { label: 'No price', hint: 'Attach a historical analysis or enter a price' },
};

const firstLine = (s: string): string => s.split(/\r?\n/)[0];
const product = (r: Row) => ({ id: r.tab?.id ?? r.itemId, title: firstLine(r.description), categoryName: null, description: r.description });

export function ElencoCosti({ quotation, onQuotation, onError, onData }: Props) {
  const [data, setData] = useState<ElencoCostiData | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ position: '', itemCode: '', description: '', unit: 'Pcs', quantity: '1', L: '', H: '' });
  const [suggestFor, setSuggestFor] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SearchHit[] | null>(null);
  const [openLine, setOpenLine] = useState<string | null>(null);
  const [materials, setMaterials] = useState<Record<string, ProductMaterial[] | 'loading' | 'none'>>({});

  /** Click a line to see the raw materials behind it (per unit and for the line's quantity). */
  const toggleMaterials = (itemId: string, tabId: string | null): void => {
    if (openLine === itemId) return setOpenLine(null);
    setOpenLine(itemId);
    if (!tabId || materials[tabId]) return;
    setMaterials((m) => ({ ...m, [tabId]: 'loading' }));
    api
      .productMaterials(tabId)
      .then((list) => setMaterials((m) => ({ ...m, [tabId]: list.length ? list : 'none' })))
      .catch(() => setMaterials((m) => ({ ...m, [tabId]: 'none' })));
  };

  useEffect(() => {
    let live = true;
    api
      .elencoCosti(quotation.id)
      .then((d) => {
        if (!live) return;
        setData(d);
        onData?.(d);
      })
      .catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [quotation, onError, onData]);

  const guard = async (fn: () => Promise<Quotation>): Promise<boolean> => {
    try {
      onQuotation(await fn());
      return true;
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  const addRow = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const ok = await guard(() =>
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
    if (!ok) return; // keep what the user typed so they can fix it
    setAdding(false);
    setDraft({ position: '', itemCode: '', description: '', unit: 'Pcs', quantity: '1', L: '', H: '' });
  };

  const suggest = async (itemId: string): Promise<void> => {
    setSuggestFor(itemId);
    setSuggestions(null);
    try {
      const hits = await api.suggestions(quotation.id, itemId, 6);
      setSuggestions((cur) => (cur === null ? hits : cur));
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

  const saveQuantity = (r: Row, raw: string): void => {
    const v = Number(raw);
    if (!(v > 0)) return onError('Quantity must be a positive number');
    if (v !== r.quantity) void guard(() => api.updateItem(quotation.id, r.itemId, { quantity: v }));
  };

  /** Adds a priced labour or transport line, pre-filled with what the original analyses allowed for. */
  const addSeparateLine = async (kind: 'labour' | 'transport', amount: number): Promise<void> => {
    await guard(async () => {
      // Prefer the catalog products for labour / transport; fall back to a typed line.
      const custom = await api.customProducts().catch(() => []);
      const product = custom.find((r) => (kind === 'labour' ? /labour/i : /transport/i).test(r.title ?? ''));
      const q = product
        ? await api.addItem(quotation.id, { catalogId: product.id, quantity: 1 })
        : await api.addRow(quotation.id, { position: '99', itemCode: kind === 'labour' ? '99-01' : '99-02', description: kind === 'labour' ? 'Site labour (installation, site management, travel)' : 'Transport to shipyard', unit: 'forfait', quantity: 1 });
      const added = q.items[q.items.length - 1];
      return amount > 0 && added ? api.updateItem(quotation.id, added.id, { unitCostOverride: Math.round(amount * 100) / 100 }) : q;
    });
  };

  if (!data) return <section className="q-ledger q-loading">Calculating costs…</section>;
  const sep = data.separate;
  const missing = sep && data.rows.length > 0 ? [!sep.hasLabourLine && 'labour', !sep.hasTransportLine && 'transport'].filter(Boolean) : [];

  return (
    <section className="q-ledger" aria-label="Line items">
      <div className="q-ledger-head" role="row">
        <span>Pos.</span>
        <span>Product</span>
        <span className="num">Quantity</span>
        <span className="num">Unit cost</span>
        <span className="num">Total</span>
        <span />
      </div>

      {data.rows.length === 0 && (
        <div className="q-empty">
          <p>This quotation has no products yet.</p>
          <p className="muted">Add products from the catalog, or type a line from the customer's bill of quantities below.</p>
        </div>
      )}

      {data.rows.map((r) => {
        const src = SOURCE[r.unitCostSource];
        return (
          <div key={r.itemId} className="q-line" data-testid={`row-${r.itemId}`}>
            <div className="q-line-main">
              <span className="q-pos">{r.position || '—'}</span>
              <div className="q-product">
                <span className="q-thumb" style={{ backgroundImage: `url(${imageOf(product(r))})` }} aria-hidden="true" />
                <div className="q-product-text">
                  <button className="q-title q-title-btn" title="Show the material breakdown" aria-expanded={openLine === r.itemId} onClick={() => toggleMaterials(r.itemId, r.tab?.id ?? null)}>
                    {firstLine(r.description)}
                    <span className="q-caret" aria-hidden="true">{openLine === r.itemId ? '▴' : '▾'}</span>
                  </button>
                  <div className="q-meta">
                    <span>{typologyOf(product(r)).label}</span>
                    {r.itemCode && <span>Item {r.itemCode}</span>}
                    {r.L || r.H ? (
                      <span>
                        {fmtNum(r.L)} × {fmtNum(r.H)} mm
                      </span>
                    ) : null}
                    {r.m2Total > 0 && <span>{fmtNum(r.m2Total, 2)} m²</span>}
                    {r.lotto && <span>Lot {r.lotto}</span>}
                  </div>
                  <div className="q-ref">
                    {r.tab ? (
                      <>
                        <span>
                          Based on <b>{r.tab.offerNo ?? r.tab.workbook}</b>, sheet {r.tab.sheet}
                        </span>
                        <button className="q-link" onClick={() => void suggest(r.itemId)}>
                          Change
                        </button>
                        <button className="q-link" onClick={() => void guard(() => api.detach(quotation.id, r.itemId))}>
                          Detach
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="q-warn">{r.warnings.find((w) => /reference|attach/i.test(w)) ?? 'no reference analysis attached'}</span>
                        <button className="q-attach" onClick={() => void suggest(r.itemId)}>
                          Attach by similarity
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <label className="q-qty">
                <input
                  type="number"
                  step="any"
                  min={0.001}
                  defaultValue={r.quantity}
                  key={`${r.itemId}-${r.quantity}`}
                  aria-label={`quantity ${r.itemCode || r.line}`}
                  onBlur={(e) => saveQuantity(r, e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                />
                <span>{r.unit}</span>
              </label>
              <div className="q-unit num">
                <div className={r.unitCost === null ? 'q-missing' : ''}>{r.unitCost === null ? 'No price' : fmtMoney(r.unitCost)}</div>
                <span className={`q-source ${r.unitCostSource}`} title={r.historicalUnitCost !== null ? `${src.hint}. Historical: ${fmtMoney(r.historicalUnitCost)}` : src.hint}>
                  {src.label}
                </span>
                <input
                  className="q-override"
                  type="number"
                  step="any"
                  min={0}
                  placeholder="Set price"
                  aria-label={`override unit cost ${r.itemCode || r.line}`}
                  defaultValue={r.unitCostOverride ?? ''}
                  key={r.itemId + String(r.unitCostOverride)}
                  onBlur={(e) => {
                    const v = e.target.value === '' ? null : Number(e.target.value);
                    if (v !== r.unitCostOverride) void guard(() => api.updateItem(quotation.id, r.itemId, { unitCostOverride: v }));
                  }}
                />
              </div>
              <div className="q-total num">{r.totalCost === null ? '—' : fmtMoney(r.totalCost)}</div>
              <button className="q-remove" onClick={() => void guard(() => api.removeItem(quotation.id, r.itemId))} title="Remove this line" aria-label={`remove ${r.itemCode || r.line}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3" />
                </svg>
              </button>
            </div>

            {openLine === r.itemId && (
              <div className="q-bom">
                {(() => {
                  const list = r.tab ? materials[r.tab.id] : 'none';
                  if (list === 'loading' || list === undefined) return <span className="muted small">Loading materials…</span>;
                  if (list === 'none') return <span className="muted small">{r.tab ? 'No material breakdown is recorded for this product.' : 'This line has no product analysis, so there is no material breakdown.'}</span>;
                  const rows = list.map((l) => ({ l, cost: l.quantity * l.material.unitCost })).sort((a, b) => b.cost - a.cost);
                  const perUnit = rows.reduce((acc, x) => acc + x.cost, 0);
                  return (
                    <>
                      <div className="q-bom-head">
                        <span>Material breakdown · {fmtNum(r.quantity, 2)} {r.unit}</span>
                        <span>
                          {fmtMoney(perUnit)} per {r.unit} · <b>{fmtMoney(perUnit * r.quantity)}</b> for this line
                        </span>
                      </div>
                      <table className="q-bom-table">
                        <thead>
                          <tr>
                            <th>Material</th>
                            <th className="num">Per {r.unit}</th>
                            <th className="num">For {fmtNum(r.quantity, 2)} {r.unit}</th>
                            <th className="num">Unit price</th>
                            <th className="num">Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(({ l, cost }) => (
                            <tr key={l.id}>
                              <td>{l.material.name}</td>
                              <td className="num">
                                {fmtMaterialQty(l.quantity)} {l.material.unit}
                              </td>
                              <td className="num">
                                {fmtMaterialQty(l.quantity * r.quantity)} {l.material.unit}
                              </td>
                              <td className="num">
                                {fmtMoney(l.material.unitCost)}/{l.material.unit}
                              </td>
                              <td className="num">{fmtMoney(cost * r.quantity)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="small muted">Raw-material prices are indicative.</p>
                    </>
                  );
                })()}
              </div>
            )}

            {suggestFor === r.itemId && (
              <div className="q-suggest">
                <div className="q-suggest-head">
                  <span>Closest historical analyses for this line</span>
                  <button className="q-link" onClick={() => setSuggestFor(null)}>
                    Close
                  </button>
                </div>
                {suggestions === null && <span className="muted">Searching…</span>}
                {suggestions?.length === 0 && <span className="muted">No similar analysis found. Enter a price instead.</span>}
                <div className="q-suggest-list">
                  {suggestions?.map((h) => (
                    <button key={h.record.id} onClick={() => void attach(r.itemId, h.record.id)} title={h.record.description ?? ''}>
                      {Math.round(h.score * 100)}% · {h.record.title}
                      <span className="muted">
                        {' '}
                        {h.record.offerNo ?? h.record.workbook}, sheet {h.record.sheet} · {fmtMoney(h.record.unitCost)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {adding ? (
        <form className="q-boq" onSubmit={(e) => void addRow(e)} aria-label="new row">
          <label className="field">
            Pos.<input value={draft.position} onChange={(e) => setDraft({ ...draft, position: e.target.value })} placeholder="04" />
          </label>
          <label className="field">
            Item<input value={draft.itemCode} onChange={(e) => setDraft({ ...draft, itemCode: e.target.value })} placeholder="04-01" />
          </label>
          <label className="field q-boq-desc">
            Description *<textarea required value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Glass balustrade on aluminium balcony, H 1130 mm" />
          </label>
          <label className="field">
            Unit<input value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
          </label>
          <label className="field">
            Quantity *<input type="number" step="any" min={0.001} required value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} />
          </label>
          <label className="field">
            L (mm)<input type="number" step="any" value={draft.L} onChange={(e) => setDraft({ ...draft, L: e.target.value })} />
          </label>
          <label className="field">
            H (mm)<input type="number" step="any" value={draft.H} onChange={(e) => setDraft({ ...draft, H: e.target.value })} />
          </label>
          <div className="q-boq-actions">
            <button className="primary" type="submit">
              Add line
            </button>
            <button type="button" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button className="q-add-line" onClick={() => setAdding(true)}>
          <span aria-hidden="true">＋</span> Add a line from the customer's bill of quantities
        </button>
      )}

      {sep && missing.length > 0 && (
        <div className="q-remind" role="note">
          <span className="q-remind-icon" aria-hidden="true">!</span>
          <div className="q-remind-text">
            <b>Don't forget to include {missing.join(' and ')}.</b>
            <span>
              Product lines exclude them.
              {(!sep.hasLabourLine && sep.labour > 0) || (!sep.hasTransportLine && sep.transport > 0) ? (
                <>
                  {' '}The original analyses allowed {!sep.hasLabourLine && sep.labour > 0 && <>{fmtMoney(sep.labour)} for labour</>}
                  {!sep.hasLabourLine && sep.labour > 0 && !sep.hasTransportLine && sep.transport > 0 && ' and '}
                  {!sep.hasTransportLine && sep.transport > 0 && <>{fmtMoney(sep.transport)} for transport</>} on these products.
                </>
              ) : (
                ' Add them as separate lines and set their price.'
              )}
            </span>
          </div>
          <div className="q-remind-actions">
            {!sep.hasLabourLine && <button onClick={() => void addSeparateLine('labour', sep.labour)}>Add labour line</button>}
            {!sep.hasTransportLine && <button onClick={() => void addSeparateLine('transport', sep.transport)}>Add transport line</button>}
          </div>
        </div>
      )}

      <div className="q-foot">
        <span>TOTAL COST</span>
        <span className="muted">{fmtNum(data.totals.m2Total, 2)} m²</span>
        <span className="q-foot-total">
          <b>{fmtMoney(data.totals.totalCost)}</b>
          {!data.totals.complete && <small>{data.totals.rowsWithoutCost} row(s) without unit cost</small>}
        </span>
      </div>

      <details className="q-details">
        <summary>Totals by position and sheet formulas</summary>
        <table className="data">
          <thead>
            <tr>
              <th>Position</th>
              <th className="num">Lines</th>
              <th className="num">m²</th>
              <th className="num">Cost per m²</th>
              <th className="num">Total</th>
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
        <ul className="small muted">
          {Object.entries(data.formulas).map(([k, v]) => (
            <li key={k}>
              <b>{k}</b>: <code>{v}</code>
            </li>
          ))}
        </ul>
        <p className="small muted">{data.note}</p>
      </details>
    </section>
  );
}
