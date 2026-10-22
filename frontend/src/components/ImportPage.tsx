import { useRef, useState, type DragEvent } from 'react';
import { api, fmtMoney, saveBlob, type ImportPreview, type ImportResult } from '../api';
import '../import.css';

type Stage = 'upload' | 'review' | 'done';
type Filter = 'all' | 'ready' | 'match' | 'review';
const STATUS: Record<'ready' | 'match' | 'review', { label: string; hint: string }> = {
  ready: { label: 'Ready to import', hint: 'Linked to a historical analysis' },
  match: { label: 'Match needed', hint: 'No analysis yet: imported as priced lines' },
  review: { label: 'Needs review', hint: 'Zero quantity, no price, extras or deductions' },
};

/** Two-stage import (like Virtuous): upload and review every line, then accept or reject the file. */
export function ImportPage({ onImported }: { onImported: (quotationId: string) => Promise<void> }) {
  const [stage, setStage] = useState<Stage>('upload');
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [header, setHeader] = useState<ImportPreview['header'] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [result, setResult] = useState<ImportResult | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const upload = async (f: File | undefined): Promise<void> => {
    setError('');
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) return setError('Choose an Excel Analisi workbook (.xlsx).');
    setBusy(true);
    try {
      const p = await api.previewImport(f);
      setPreview(p);
      setHeader(p.header);
      setFilter(p.counts.review ? 'review' : 'all');
      setStage('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const accept = async (): Promise<void> => {
    if (!preview || !header) return;
    setBusy(true);
    setError('');
    try {
      setResult(await api.commitImport(preview.token, header));
      setStage('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const reject = async (): Promise<void> => {
    if (preview) await api.rejectImport(preview.token).catch(() => undefined);
    setPreview(null);
    setStage('upload');
  };

  const downloadFlagged = (): void => {
    if (!preview) return;
    const flagged = preview.lines.filter((l) => l.status !== 'ready');
    const esc = (v: unknown): string => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = ['Row,Position,Item,Description,Unit,Quantity,Unit cost,Status,Reason', ...flagged.map((l) => [l.row, l.position, l.itemCode, l.title, l.unit, l.quantity, l.unitCost, STATUS[l.status].label, l.reason].map(esc).join(','))].join('\n');
    saveBlob(new Blob([csv], { type: 'text/csv' }), `${preview.header.reference} flagged lines.csv`);
  };

  const steps = ['Upload', 'Review', 'Import'];
  const current = stage === 'upload' ? 0 : stage === 'review' ? 1 : 2;
  const lines = preview ? preview.lines.filter((l) => filter === 'all' || l.status === filter) : [];

  return (
    <div className="imp">
      <header className="imp-head">
        <h1>Import a quotation</h1>
        <p>Upload an existing Analisi workbook, review what was found, then accept it as a draft quotation or reject it. Nothing is saved until you accept.</p>
      </header>

      <ol className="imp-progress" aria-label="Import steps">
        {steps.map((s, i) => (
          <li key={s} className={i < current ? 'done' : i === current ? 'now' : ''}>
            <span>{i < current ? '✓' : i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      {error && (
        <div className="imp-error" role="alert">
          {error}
        </div>
      )}

      {stage === 'upload' && (
        <div
          className={`imp-drop ${drag ? 'over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e: DragEvent) => {
            e.preventDefault();
            setDrag(false);
            void upload(e.dataTransfer.files[0]);
          }}
          onClick={() => !busy && input.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
          aria-label="Choose a workbook to import"
        >
          <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => void upload(e.target.files?.[0])} />
          <div className="imp-sheet" aria-hidden="true">
            <span />
            <span />
            <span />
            <b>xlsx</b>
          </div>
          {busy ? (
            <>
              <strong>Checking the workbook…</strong>
              <span className="muted">Reading DATI GEN. and every ELENCO COSTI line</span>
            </>
          ) : (
            <>
              <strong>Drop an Analisi workbook here</strong>
              <span className="muted">or click to browse · e.g. “TM1641-03 Analisi.xlsx”</span>
            </>
          )}
        </div>
      )}

      {stage === 'review' && preview && header && (
        <>
          <section className="imp-card">
            <div className="imp-card-head">
              <h2>Offer details</h2>
              <span className="muted small">from DATI GEN. in {preview.fileName} · edit before importing</span>
            </div>
            <div className="imp-fields">
              {(
                [
                  ['reference', 'Reference / offer n°'],
                  ['name', 'Project / quotation name'],
                  ['customer', 'Customer'],
                  ['date', 'Date'],
                  ['estimator', 'Estimator'],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="field">
                  {label}
                  <input type={k === 'date' ? 'date' : 'text'} value={header[k]} onChange={(e) => setHeader({ ...header, [k]: e.target.value })} />
                </label>
              ))}
            </div>
          </section>

          <div className="imp-buckets" role="tablist" aria-label="Line status">
            <button role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
              <b>{preview.lines.length}</b>
              <span>All lines</span>
              <small>{fmtMoney(preview.totalEstimatedCost)} estimated</small>
            </button>
            {(['ready', 'match', 'review'] as const).map((k) => (
              <button key={k} role="tab" aria-selected={filter === k} className={`${filter === k ? 'on' : ''} b-${k}`} onClick={() => setFilter(k)}>
                <b>{preview.counts[k]}</b>
                <span>{STATUS[k].label}</span>
                <small>{STATUS[k].hint}</small>
              </button>
            ))}
          </div>

          <section className="imp-card imp-lines">
            <table>
              <thead>
                <tr>
                  <th>Pos.</th>
                  <th>Line</th>
                  <th className="num">Qty</th>
                  <th className="num">Unit cost</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.row}>
                    <td>{l.itemCode ?? l.position ?? '—'}</td>
                    <td className="imp-line-title">{l.title}</td>
                    <td className="num">
                      {l.quantity} {l.unit}
                    </td>
                    <td className="num">{fmtMoney(l.unitCost)}</td>
                    <td>
                      <span className={`imp-pill p-${l.status}`}>{STATUS[l.status].label}</span>
                      <div className="small muted">{l.reason}</div>
                    </td>
                  </tr>
                ))}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      No lines in this group.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <div className="imp-actions sticky">
            <button className="primary" onClick={() => void accept()} disabled={busy}>
              {busy ? 'Importing…' : `Accept & import ${preview.lines.length} lines`}
            </button>
            {preview.counts.match + preview.counts.review > 0 && <button onClick={downloadFlagged}>Download flagged lines (CSV)</button>}
            <button className="imp-reject" onClick={() => void reject()} disabled={busy}>
              Reject file
            </button>
          </div>
        </>
      )}

      {stage === 'done' && result && (
        <section className="imp-result">
          <div className="imp-result-head">
            <span className="imp-ok" aria-hidden="true">
              ✓
            </span>
            <div>
              <h2>{result.reference} imported</h2>
              <p>
                {result.name} · {result.customer}
              </p>
            </div>
          </div>
          <dl className="imp-stats">
            <div>
              <dt>Lines imported</dt>
              <dd>{result.lines}</dd>
            </div>
            <div>
              <dt>Linked to historical analyses</dt>
              <dd>
                {result.linkedToCatalog} <small>of {result.lines}</small>
              </dd>
            </div>
            <div>
              <dt>Estimated cost</dt>
              <dd>{fmtMoney(result.totalEstimatedCost)}</dd>
            </div>
          </dl>
          <div className="imp-actions">
            <button className="primary" onClick={() => void onImported(result.quotationId)}>
              Open draft quotation
            </button>
            <button
              onClick={() => {
                setResult(null);
                setPreview(null);
                setStage('upload');
              }}
            >
              Import another
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
