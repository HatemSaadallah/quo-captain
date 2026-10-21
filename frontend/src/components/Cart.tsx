import { useEffect, useRef, useState } from 'react';
import {
  api,
  ApiError,
  fmtMoney,
  fmtNum,
  type ExcelStatus,
  type GenerationResult,
  type Project,
  type ProjectItem,
  type ProjectValidation,
  type UpdateItemDto,
} from '../api';

interface Props {
  project: Project;
  onProject: (p: Project) => void;
  onError: (msg: string) => void;
}

export function Cart({ project, onProject, onError }: Props) {
  const [validation, setValidation] = useState<ProjectValidation | null>(null);
  const [excel, setExcel] = useState<ExcelStatus | null>(null);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [report, setReport] = useState<{ projectId: string; value: GenerationResult } | null>(null);
  const generating = generatingFor === project.id;
  const result = report?.projectId === project.id ? report.value : null;
  const activeProject = useRef<string | null>(project.id);
  activeProject.current = project.id;
  useEffect(() => {
    activeProject.current = project.id;
    return () => {
      activeProject.current = null;
    };
  }, [project.id]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setValidation(null);
    api
      .validation(project.id)
      .then((value) => {
        if (active) setValidation(value);
      })
      .catch(() => {
        if (active) setValidation(null);
      });
    return () => {
      active = false;
    };
  }, [project]);

  useEffect(() => {
    api
      .excelStatus()
      .then(setExcel)
      .catch(() => setExcel(null));
  }, []);

  const patch = async (item: ProjectItem, dto: UpdateItemDto): Promise<void> => {
    try {
      const next = await api.updateItem(project.id, item.id, dto);
      if (activeProject.current === project.id) onProject(next);
    } catch (e) {
      if (activeProject.current === project.id) onError(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async (item: ProjectItem): Promise<void> => {
    try {
      const next = await api.removeItem(project.id, item.id);
      if (activeProject.current === project.id) onProject(next);
    } catch (e) {
      if (activeProject.current === project.id) onError(e instanceof Error ? e.message : String(e));
    }
  };

  const generate = async (): Promise<void> => {
    setGeneratingFor(project.id);
    setReport(null);
    try {
      const r = await api.generate(project.id);
      if (activeProject.current !== project.id) return;
      setReport({ projectId: project.id, value: r });
      const next = await api.project(project.id);
      if (activeProject.current === project.id) onProject(next);
    } catch (e) {
      if (activeProject.current !== project.id) return;
      if (e instanceof ApiError && e.body && typeof e.body === 'object' && 'issues' in e.body) {
        const issues = (e.body as { issues: ProjectValidation['issues'] }).issues;
        onError(
          `Not generated: ${issues
            .filter((i) => i.level === 'error')
            .map((i) => i.message)
            .join(' · ')}`,
        );
      } else onError(e instanceof Error ? e.message : String(e));
    } finally {
      if (activeProject.current === project.id) setGeneratingFor(null);
    }
  };

  const issuesFor = (item: ProjectItem) => validation?.issues.filter((i) => i.itemId === item.id) ?? [];
  const total = project.items.reduce((acc, it) => acc + (it.historicalCostCompatible === false ? 0 : (it.historicalUnitCost ?? 0) * (it.quantity > 0 ? it.quantity : 0)), 0);
  const incompleteEstimate = project.items.some((it) => it.historicalCostCompatible === false || it.historicalUnitCost === null);
  const lastGen = project.generations[0];

  return (
    <section className="panel">
      <h2>
        C · Cart — quotation cost-analysis items
        <span className="muted small">{project.reference || '(no reference)'} · template {project.templateWorkbook}</span>
      </h2>
      <table className="data">
        <thead>
          <tr>
            <th>Pos.</th>
            <th>Item</th>
            <th>Description · source</th>
            <th className="num">Qty</th>
            <th>Unit</th>
            <th className="num">Hist. unit cost</th>
            <th className="num">Est. total</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {project.items.map((it) => {
            const iss = issuesFor(it);
            const err = iss.some((i) => i.level === 'error');
            return (
              <tr key={it.id} style={err ? { background: '#fff5f4' } : undefined}>
                <td>
                  <input className="narrow" defaultValue={it.position} key={it.id + 'p'} onBlur={(e) => e.target.value !== it.position && patch(it, { position: e.target.value })} />
                </td>
                <td>
                  <input className="narrow" defaultValue={it.itemCode} key={it.id + 'i'} onBlur={(e) => e.target.value !== it.itemCode && patch(it, { itemCode: e.target.value })} />
                </td>
                <td style={{ minWidth: 220 }}>
                  {expanded === it.id ? (
                    <textarea defaultValue={it.description} onBlur={(e) => e.target.value !== it.description && patch(it, { description: e.target.value })} />
                  ) : (
                    <div onClick={() => setExpanded(it.id)} title="click to edit" style={{ cursor: 'text' }}>
                      {it.description.split('\n')[0]}
                    </div>
                  )}
                  <div className="small muted">
                    <span className="chip">{it.sourceOfferNo ?? it.sourceWorkbook}</span> sheet {it.sourceSheet ?? '—'} · {it.L && it.H ? `${fmtNum(it.L)}×${fmtNum(it.H)} mm` : ''}
                    {it.params.map((p) => (
                      <span key={p.cell}>
                        {' '}
                        · {p.label}{' '}
                        <input
                          className="narrow"
                          style={{ width: 70, display: 'inline-block' }}
                          defaultValue={p.value === null ? '' : String(p.value)}
                          key={it.id + p.cell + String(p.value)}
                          onBlur={(e) => String(p.value ?? '') !== e.target.value && patch(it, { params: [{ cell: p.cell, value: e.target.value }] })}
                        />
                        {p.value !== p.original && <span title={`historical: ${String(p.original)}`}> ✎</span>}
                      </span>
                    ))}
                  </div>
                  {iss.length > 0 && (
                    <ul className="issues small">
                      {iss.map((i, k) => (
                        <li key={k} className={i.level}>
                          {i.message.replace(/^[^:]*: /, '')}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="num">
                  <input className="narrow" type="number" step="any" min={0} defaultValue={it.quantity} key={it.id + 'q' + it.quantity} onBlur={(e) => Number(e.target.value) !== it.quantity && patch(it, { quantity: Number(e.target.value) })} />
                </td>
                <td>
                  <input className="narrow" defaultValue={it.unit} key={it.id + 'u'} onBlur={(e) => e.target.value !== it.unit && patch(it, { unit: e.target.value })} />
                </td>
                <td className="num">{fmtMoney(it.historicalUnitCost)}{it.historicalUnit && it.historicalCostCompatible === false && <span className="small muted"> / {it.historicalUnit}</span>}</td>
                <td className="num">{fmtMoney(it.historicalUnitCost !== null && it.historicalCostCompatible !== false ? it.historicalUnitCost * it.quantity : null)}</td>
                <td>
                  <button className="danger" onClick={() => void remove(it)} title="remove from cart">
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
          {project.items.length === 0 && (
            <tr>
              <td colSpan={8} className="muted">
                The cart is empty. Search for a historical analysis on the left and add it.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="totals">
        <span className="muted small" style={{ alignSelf: 'center' }}>
          Indicative: Σ quantity × historical unit cost. Excel recomputes the real costs from the copied analyses and the template's price list.
        </span>
        <span>
          {incompleteEstimate ? 'Known historical subtotal' : 'Estimated total'} <b>{fmtMoney(total)}</b>
        </span>
      </div>

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

      <h3>D · Excel generation</h3>
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
          {excel ? (excel.available ? <span className="badge ok">Excel available: recalculation will run</span> : <span className="badge warn">Excel not scriptable: output will be a draft recalculated on open</span>) : 'checking Excel…'}
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

function LastGeneration({ gen }: { gen: Project['generations'][number] }) {
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
