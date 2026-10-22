import { useEffect, useRef, useState, type DragEvent } from 'react';
import { api, fmtMoney } from '../api';
import '../import.css';

type Result = Awaited<ReturnType<typeof api.importWorkbook>>;
const STEPS = ['Reading the workbook', 'Finding offer details in DATI GEN.', 'Reading ELENCO COSTI lines', 'Matching lines to historical analyses', 'Creating the draft quotation'];

/** Import an existing Somec Analisi workbook as a project + draft quotation. */
export function ImportPage({ onImported }: { onImported: (quotationId: string) => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // The server does the work in one request; the steps give a sense of progress while it runs.
  useEffect(() => {
    if (!busy) return;
    setStep(0);
    const t = window.setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1400);
    return () => window.clearInterval(t);
  }, [busy]);

  const pick = (f: File | undefined): void => {
    setError('');
    setResult(null);
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) return setError('Choose an Excel Analisi workbook (.xlsx).');
    setFile(f);
  };

  const onDrop = (e: DragEvent): void => {
    e.preventDefault();
    setDrag(false);
    pick(e.dataTransfer.files[0]);
  };

  const run = async (): Promise<void> => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      setResult(await api.importWorkbook(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="imp">
      <header className="imp-head">
        <h1>Import a quotation</h1>
        <p>Upload an existing Analisi workbook. Its offer details become a project and its ELENCO COSTI lines become a draft quotation you can edit, price and export.</p>
      </header>

      {!result && (
        <div
          className={`imp-drop ${drag ? 'over' : ''} ${file ? 'has-file' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          onClick={() => !busy && input.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
          aria-label="Choose a workbook to import"
        >
          <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => pick(e.target.files?.[0])} />
          <div className="imp-sheet" aria-hidden="true">
            <span />
            <span />
            <span />
            <b>xlsx</b>
          </div>
          {file ? (
            <>
              <strong>{file.name}</strong>
              <span className="muted">{(file.size / 1024 / 1024).toFixed(1)} MB · click to choose another file</span>
            </>
          ) : (
            <>
              <strong>Drop an Analisi workbook here</strong>
              <span className="muted">or click to browse · e.g. “TM1641-03 Analisi.xlsx”</span>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="imp-error" role="alert">
          {error}
        </div>
      )}

      {file && !result && (
        <div className="imp-actions">
          <button className="primary" onClick={() => void run()} disabled={busy}>
            {busy ? 'Importing…' : 'Import quotation'}
          </button>
          {!busy && (
            <button
              onClick={() => {
                setFile(null);
                setError('');
              }}
            >
              Clear
            </button>
          )}
        </div>
      )}

      {busy && (
        <ol className="imp-steps" aria-live="polite">
          {STEPS.map((s, i) => (
            <li key={s} className={i < step ? 'done' : i === step ? 'now' : ''}>
              <span className="imp-step-dot" aria-hidden="true" />
              {s}
            </li>
          ))}
        </ol>
      )}

      {result && (
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
                setFile(null);
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
