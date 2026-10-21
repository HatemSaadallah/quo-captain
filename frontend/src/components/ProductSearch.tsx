import { useEffect, useState } from 'react';
import { api, fmtMoney, fmtNum, type CatalogFacets, type CatalogRecord, type SearchHit, type SearchResult } from '../api';

interface Props {
  facets: CatalogFacets | null;
  canAdd: boolean;
  onAdd: (record: CatalogRecord, quantity: number, params: Array<{ cell: string; value: number | string | null }>) => Promise<void>;
  onError: (msg: string) => void;
  addLabel?: string;
}

const scoreLabel = (h: SearchHit): string => (h.semanticScore !== null ? `${Math.round(h.score * 100)}% match` : `${Math.round(h.lexicalScore * 100)}% text`);

export function ProductSearch({ facets, canAdd, onAdd, onError, addLabel = 'Add to cart' }: Props) {
  const [q, setQ] = useState('prefabricated balcony 1600x2560');
  const [workbook, setWorkbook] = useState('');
  const [category, setCategory] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<CatalogRecord | null>(null);
  const [similar, setSimilar] = useState<SearchHit[]>([]);
  const [quantity, setQuantity] = useState<string>('1');
  const [params, setParams] = useState<Record<string, string>>({});

  const run = async (query = q): Promise<void> => {
    setBusy(true);
    try {
      setResult(await api.search(query, { workbook: workbook || undefined, category: category || undefined }));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workbook, category]);

  const select = async (r: CatalogRecord): Promise<void> => {
    setSelected(r);
    setQuantity(String(r.quantity ?? 1));
    setParams(Object.fromEntries(r.params.filter((p) => p.editable).map((p) => [p.cell, p.value === null ? '' : String(p.value)])));
    setSimilar([]);
    try {
      setSimilar(await api.similar(r.id, 6));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const add = async (): Promise<void> => {
    if (!selected) return;
    const qty = Number(quantity);
    if (!(qty > 0)) return onError('Quantity must be a positive number');
    const prms = selected.params
      .filter((p) => p.editable)
      .map((p) => ({ cell: p.cell, value: params[p.cell] === '' ? null : typeof p.value === 'number' ? Number(params[p.cell]) : params[p.cell] }));
    await onAdd(selected, qty, prms);
  };

  return (
    <section className="panel">
      <h2>
        Find a historical analysis
        {result && (
          <span className="chip" title={`embedding index: ${result.embeddingStatus}`}>
            {result.semantic ? 'semantic + text search' : result.embeddingStatus === 'building' ? 'text search (semantic index warming up…)' : 'text search'}
          </span>
        )}
      </h2>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="describe the product: e.g. glass balustrade 1128 high, windscreen, raised floor…" />
        <button className="primary" type="submit" disabled={busy}>
          {busy ? <span className="spinner" /> : 'Search'}
        </button>
      </form>
      <div className="row" style={{ marginTop: 8 }}>
        <select value={workbook} onChange={(e) => setWorkbook(e.target.value)}>
          <option value="">all workbooks</option>
          {facets?.workbooks.map((w) => (
            <option key={w.workbook} value={w.workbook}>
              {w.offerNo ?? w.workbook} · {w.projectName}
            </option>
          ))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">all product types</option>
          {facets?.categories.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name} ({c.count})
            </option>
          ))}
        </select>
      </div>

      <div className="results" style={{ marginTop: 10 }}>
        {result?.hits.map((h) => (
          <div key={h.record.id} className={`result ${selected?.id === h.record.id ? 'active' : ''}`} onClick={() => void select(h.record)}>
            <div className="title">{h.record.title ?? '(no description)'}</div>
            <div className="cost">{fmtMoney(h.record.unitCost)}</div>
            <div className="small muted">
              <span className="chip">{h.record.offerNo ?? h.record.workbook}</span> sheet <b>{h.record.sheet ?? '—'}</b> · item {h.record.itemCode} · {h.record.categoryName ?? '—'} · {h.record.L && h.record.H ? `${fmtNum(h.record.L)}×${fmtNum(h.record.H)} mm` : ''} ·{' '}
              {fmtNum(h.record.quantity)} {h.record.unit}
            </div>
            <div className="small muted" style={{ textAlign: 'right' }}>
              {scoreLabel(h)}
            </div>
          </div>
        ))}
        {result && result.hits.length === 0 && <div className="muted">No analysis matches.</div>}
      </div>

      {selected && (
        <div className="detail stack">
          <div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <b>{selected.title}</b>
              <span className="chip">
                {selected.workbook} › sheet {selected.sheet ?? 'missing'} › row {selected.row}
              </span>
            </div>
            <div className="small muted">
              Historical project {selected.projectName} · client {selected.client} · {selected.projectDate} · estimator {selected.estimator} · class {selected.productClass ?? '—'} · analysis unit {selected.analysisUnit ?? '—'}
            </div>
          </div>
          <pre>{selected.description}</pre>
          <div className="grid2">
            <div>
              <h3>Historical cost (estimated cost, not selling price)</h3>
              <table className="data">
                <tbody>
                  <tr>
                    <td>Unit cost (ELENCO COSTI)</td>
                    <td className="num">
                      <b>{fmtMoney(selected.unitCost)}</b> / {selected.unit}
                    </td>
                  </tr>
                  <tr>
                    <td>Unit cost (sheet E67)</td>
                    <td className="num">{fmtMoney(selected.sheetUnitCost)}</td>
                  </tr>
                  <tr>
                    <td>Historical quantity</td>
                    <td className="num">{fmtNum(selected.quantity, 3)}</td>
                  </tr>
                  <tr>
                    <td>Dimensions L × H</td>
                    <td className="num">
                      {fmtNum(selected.L)} × {fmtNum(selected.H)} mm
                    </td>
                  </tr>
                  <tr>
                    <td>Unit weight</td>
                    <td className="num">{fmtNum(selected.unitWeightKg, 1)} kg</td>
                  </tr>
                  <tr>
                    <td>Line items / price-list codes</td>
                    <td className="num">
                      {selected.lineItemCount} / {selected.codesUsed.length}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div className="small muted" style={{ marginTop: 4 }}>
                Source cells: {selected.sourceCells.unitCost}, {selected.sourceCells.quantity}
                {selected.sourceCells.sheetUnitCost ? `, ${selected.sourceCells.sheetUnitCost}` : ''}
              </div>
            </div>
            <div>
              <h3>Cost breakdown (per unit)</h3>
              <table className="data">
                <tbody>
                  {selected.costBreakdown.slice(0, 8).map((c) => (
                    <tr key={c.code}>
                      <td>{c.category}</td>
                      <td className="num">{fmtMoney(c.unitCost)}</td>
                    </tr>
                  ))}
                  {selected.costBreakdown.length > 8 && (
                    <tr>
                      <td className="muted">… {selected.costBreakdown.length - 8} more categories</td>
                      <td />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {selected.warnings.length > 0 && (
            <div className="small">
              <b>Extraction notes:</b>
              <ul className="issues">
                {selected.warnings.map((w, i) => (
                  <li key={i} className="warning">
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h3>Use as starting template</h3>
            <div className="grid2">
              <label className="field">
                New quantity ({selected.unit})<input type="number" min={0.001} step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </label>
              {selected.params
                .filter((p) => p.editable)
                .map((p) => (
                  <label className="field" key={p.cell}>
                    {p.label} ({p.unit ?? '—'}, cell {p.cell})
                    <input type={typeof p.value === 'number' ? 'number' : 'text'} step="any" value={params[p.cell] ?? ''} onChange={(e) => setParams({ ...params, [p.cell]: e.target.value })} />
                  </label>
                ))}
              {selected.params
                .filter((p) => !p.editable)
                .map((p) => (
                  <label className="field" key={p.cell}>
                    {p.label} ({p.unit ?? '—'}) — derived
                    <input value={p.value === null ? '' : String(p.value)} disabled title={p.formula ? `= ${p.formula}` : ''} />
                  </label>
                ))}
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="primary" onClick={() => void add()} disabled={!canAdd || !selected.sheet}>
                {addLabel}
              </button>
              {!selected.sheet && <span className="small" style={{ color: 'var(--err)' }}>This row has no analysis sheet in its workbook; it cannot be copied.</span>}
              {!canAdd && selected.sheet && <span className="small muted">Choose or create a quotation first.</span>}
            </div>
          </div>

          <div>
            <h3>Similar analyses</h3>
            <div className="similar">
              {similar.map((s) => (
                <button key={s.record.id} onClick={() => void select(s.record)} title={s.record.description ?? ''}>
                  {s.record.title} <span className="muted">· {s.record.offerNo ?? s.record.workbook} sheet {s.record.sheet} · {fmtMoney(s.record.unitCost)} · {Math.round(s.score * 100)}%</span>
                </button>
              ))}
              {similar.length === 0 && <span className="muted small">loading…</span>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
