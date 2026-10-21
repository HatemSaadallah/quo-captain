import { useEffect, useState } from 'react';
import { api, ApiError, fmtMoney, fmtNum, type ExcelStatus, type GenerationResult, type Quotation, type QuotationValidation } from '../api';

interface Props {
  quotation: Quotation;
  onQuotation: (p: Quotation) => void;
  onError: (msg: string) => void;
}

export function Cart({ quotation, onQuotation, onError }: Props) {
  const [validation, setValidation] = useState<QuotationValidation | null>(null);
  const [excel, setExcel] = useState<ExcelStatus | null>(null);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);

  useEffect(() => {
    api.validation(quotation.id).then(setValidation).catch(() => setValidation(null));
  }, [quotation]);

  useEffect(() => {
    api.excelStatus().then(setExcel).catch(() => setExcel(null));
  }, []);

  const generate = async (): Promise<void> => {
    setGenerating(true);
    setResult(null);
    try {
      const r = await api.generate(quotation.id);
      setResult(r);
      onQuotation(await api.quotation(quotation.id));
    } catch (e) {
      if (e instanceof ApiError && e.body && typeof e.body === 'object' && 'issues' in e.body) {
        const issues = (e.body as { issues: QuotationValidation['issues'] }).issues;
        onError(`Not generated: ${issues.filter((i) => i.level === 'error').map((i) => i.message).join(' · ')}`);
      } else onError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  const lastGen = quotation.generations[0];

  return (
    <section className="panel">
      <h2>Checks & exports <span className="muted small">{quotation.reference || '(no reference)'} · {quotation.items.length} items</span></h2>

      {validation && validation.issues.filter((i) => !i.itemId).length > 0 && (
        <ul className="issues" style={{ marginTop: 8 }}>
          {validation.issues
            .filter((i) => !i.itemId)
            .map((i, k) => (
              <li key={k} className={i.level}>
                {i.message}
              </li>
            ))}
        </ul>
      )}

      <div className="row">
        <button className="primary big" onClick={() => void generate()} disabled={generating || !validation?.ok}>
          {generating ? (
            <>
              <span className="spinner" /> Generating…
            </>
          ) : (
            'Generate Excel Analysis'
          )}
        </button>
        <div className="small muted">
          {excel ? (excel.available ? <span className="badge ok">Excel detected · automatic recalculation is opt-in</span> : <span className="badge warn">Excel unavailable · output will recalculate when opened in Excel</span>) : 'checking Excel…'}
          {excel && !excel.available && <div>{excel.detail}</div>}
        </div>
      </div>
      {!validation?.ok && validation && <div className="small muted" style={{ marginTop: 4 }}>Fix the errors above to enable generation.</div>}

      {(result || lastGen) && (
        <div className="report stack" style={{ marginTop: 12 }}>
          {result ? <ReportView result={result} /> : lastGen && <LastGeneration gen={lastGen} />}
        </div>
      )}
    </section>
  );
}

function DownloadButton({ file, label, primary = false }: { file: string; label: string; primary?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (): Promise<void> => {
    setBusy(true);
    setErr(null);
    try {
      await api.download(file);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button className={primary ? 'primary' : ''} onClick={() => void run()} disabled={busy}>
        {busy ? '…' : label}
      </button>
      {err && <span style={{ color: 'var(--err)' }}>{err}</span>}
    </>
  );
}

function LastGeneration({ gen }: { gen: Quotation['generations'][number] }) {
  return (
    <div className="small row">
      Last generation {new Date(gen.at).toLocaleString()} · <span className={`badge ${gen.status === 'validated' ? 'ok' : gen.status === 'failed' ? 'err' : 'warn'}`}>{gen.status}</span>
      <DownloadButton file={gen.file} label="download .xlsx" />
      <DownloadButton file={gen.reportFile} label="validation report" />
    </div>
  );
}

function ReportView({ result }: { result: GenerationResult }) {
  const r = result.report;
  const badge = r.status === 'validated' ? 'ok' : r.status === 'failed' ? 'err' : 'warn';
  return (
    <>
      <div className="row">
        <span className={`badge ${badge}`}>{r.status.replace('_', ' ')}</span>
        <DownloadButton file={result.outputFile} label={`⬇ Download ${result.outputFile.split('/').pop() ?? 'workbook'}`} primary />
        <DownloadButton file={result.reportFile} label="validation_report.json" />
      </div>
      <div>{r.summary}</div>
      <div className="small muted">
        Engine {r.engine} · recalculation: {r.recalculation.performed ? r.recalculation.method : 'not performed'} · {r.sheetsCopied.length} sheets copied ({r.sheetsCopied.join(', ')}) · modified: {r.sheetsModified.join(', ')} · external links kept: {r.externalLinks.length}
      </div>
      <table className="data">
        <thead>
          <tr>
            <th>Item</th>
            <th>Sheet / row</th>
            <th className="num">Qty</th>
            <th className="num">Hist. unit cost</th>
            <th className="num">Recalculated unit cost</th>
            <th className="num">Total</th>
            <th>Missing codes</th>
          </tr>
        </thead>
        <tbody>
          {r.items.map((it) => (
            <tr key={it.itemId}>
              <td>
                {it.position} / {it.itemCode}
                <div className="small muted">
                  from {it.sourceWorkbook} sheet {it.sourceSheet}
                </div>
              </td>
              <td>
                '{it.sheet}' · ELENCO COSTI {it.row} · BOQ {it.boqRow}
              </td>
              <td className="num">{fmtNum(it.quantity, 3)}</td>
              <td className="num">{fmtMoney(it.historicalUnitCost)}</td>
              <td className="num">{it.unitCost === null ? <span className="muted">needs Excel</span> : fmtMoney(it.unitCost)}</td>
              <td className="num">{fmtMoney(it.totalCost)}</td>
              <td className="small">{it.missingCodes.length ? `${it.missingCodes.length}: ${it.missingCodes.slice(0, 3).join(', ')}…` : 'none'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row small">
        <span>ELENCO COSTI total: <b>{fmtMoney(r.totals.elencoCostiTotal)}</b></span>
        <span>Σ items: <b>{fmtMoney(r.totals.sumOfItems)}</b></span>
        <span>historical estimate: <b>{fmtMoney(r.totals.historicalEstimate)}</b></span>
      </div>
      <div className="checks">
        {r.checks.map((c, i) => (
          <div key={i} className={c.level}>
            [{c.level}] {c.check}: {c.detail}
          </div>
        ))}
      </div>
    </>
  );
}
