import { useRef, useState } from 'react';
import { api, fmtMoney, type Project } from '../api';
import { navigate } from '../route';

type Result = Awaited<ReturnType<typeof api.projectRequirements>>;

/** Upload the client's requirements, get matching catalog products per need, turn them into a draft quotation. */
export function ProjectRequirements({ project, onUpdated }: { project: Project; onUpdated: () => void }) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [choice, setChoice] = useState<Record<number, string | null>>({});
  const [qty, setQty] = useState<Record<number, string>>({});
  const [creating, setCreating] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const readFile = async (f: File | undefined): Promise<void> => {
    if (!f) return;
    setError('');
    if (!/\.(txt|md|csv|tsv|json)$/i.test(f.name) && !f.type.startsWith('text/')) return setError('Upload the requirements as a text, Markdown or CSV file, or paste them below.');
    setFileName(f.name);
    setText((await f.text()).slice(0, 30000));
  };

  const analyse = async (): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      const r = await api.projectRequirements(project.id, { text, fileName });
      setResult(r);
      setChoice(Object.fromEntries(r.needs.map((n, i) => [i, n.products[0]?.id ?? null])));
      setQty(Object.fromEntries(r.needs.map((n, i) => [i, String(n.quantity ?? 1)])));
      onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const selected = result ? result.needs.map((n, i) => ({ n, id: choice[i], q: Number(qty[i]) || 1 })).filter((x) => x.id) : [];
  const total = selected.reduce((acc, x) => acc + (x.n.products.find((p) => p.id === x.id)?.unitCost ?? 0) * x.q, 0);

  const createDraft = async (): Promise<void> => {
    setCreating(true);
    setError('');
    try {
      const [all, facets] = await Promise.all([api.quotations(), api.facets()]);
      const next = Math.max(2099, ...all.map((q) => Number(/TM(\d{4})/.exec(q.reference)?.[1] ?? 0))) + 1;
      const template = project.quotations[0]?.templateWorkbook ?? facets.workbooks[0]?.workbook ?? '';
      const q = await api.createQuotation({ name: `${project.name} - client requirements`, projectId: project.id, reference: `TM${next}-00`, date: new Date().toISOString().slice(0, 10), estimator: '', templateWorkbook: template, status: 'draft' });
      for (const x of selected) await api.addItem(q.id, { catalogId: x.id as string, quantity: x.q });
      onUpdated();
      navigate({ page: 'quotation', id: q.id, tab: 'elenco' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="req">
      <div className="req-input">
        <div className="req-drop" role="button" tabIndex={0} onClick={() => input.current?.click()} onKeyDown={(e) => e.key === 'Enter' && input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void readFile(e.dataTransfer.files[0]); }}>
          <input ref={input} type="file" hidden accept=".txt,.md,.csv,.tsv,.json,text/*" onChange={(e) => void readFile(e.target.files?.[0])} />
          <strong>{fileName ?? 'Upload the client requirements'}</strong>
          <span className="small muted">{fileName ? 'Click to choose another file' : 'Text, Markdown or CSV · or paste them below'}</span>
        </div>
        <textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder={'e.g.\n- Glass windscreens H=2000 around the pool deck, approx 120 m2\n- Balcony dividers with door, 1850x2000, 48 pcs'} aria-label="Client requirements" />
        <div className="req-actions">
          <button className="primary" disabled={busy || !text.trim()} onClick={() => void analyse()}>
            {busy ? 'Reading the requirements…' : 'Find matching products'}
          </button>
          <span className="small muted">The requirements are also saved to the project brief.</span>
        </div>
      </div>

      {error && <div className="finder-feedback finder-error" role="alert">{error}</div>}

      {result && (
        <div className="req-results">
          <p className="req-summary">
            {result.mode === 'preview' && <span className="project-preview-label">Keyword match · AI unavailable</span>}
            {result.summary}
          </p>
          {result.needs.length === 0 && <p className="muted">No product needs were recognised in this file.</p>}
          {result.needs.map((n, i) => (
            <section key={i} className="req-need">
              <div className="req-need-head">
                <b>{n.description}</b>
                <label className="req-qty">
                  <input type="number" min={0.001} step="any" value={qty[i] ?? ''} onChange={(e) => setQty({ ...qty, [i]: e.target.value })} aria-label={`Quantity for ${n.description}`} />
                  <span>{n.unit ?? n.products[0]?.unit ?? 'units'}</span>
                </label>
              </div>
              <div className="req-options">
                {n.products.map((p) => (
                  <label key={p.id} className={`req-option ${choice[i] === p.id ? 'on' : ''}`}>
                    <input type="radio" name={`need-${i}`} checked={choice[i] === p.id} onChange={() => setChoice({ ...choice, [i]: p.id })} />
                    <span className="req-option-title">{p.title}</span>
                    <span className="small muted">
                      {p.category ?? ''} · {p.source}
                    </span>
                    <span className="req-option-cost">
                      {fmtMoney(p.unitCost)}/{p.unit ?? 'unit'}
                    </span>
                  </label>
                ))}
                <label className={`req-option skip ${choice[i] === null ? 'on' : ''}`}>
                  <input type="radio" name={`need-${i}`} checked={choice[i] === null} onChange={() => setChoice({ ...choice, [i]: null })} />
                  <span className="req-option-title">Skip this need</span>
                </label>
                {n.products.length === 0 && <span className="small muted">No matching product in the catalog.</span>}
              </div>
            </section>
          ))}
          {selected.length > 0 && (
            <div className="req-create">
              <span>
                {selected.length} products · estimated <b>{fmtMoney(total)}</b>
              </span>
              <button className="primary" disabled={creating} onClick={() => void createDraft()}>
                {creating ? 'Creating…' : 'Create draft quotation'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
