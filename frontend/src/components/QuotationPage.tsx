import { useCallback, useState } from 'react';
import { api, fmtMoney, fmtNum, type CatalogFacets, type ElencoCosti as ElencoCostiData, type Quotation, quotationCost } from '../api';
import { typologyOf } from '../product';
import '../quotation.css';
import { navigate } from '../route';
import { ElencoCosti } from './ElencoCosti';
import { QuotationForm } from './QuotationForm';
import { WorkbookView } from './WorkbookView';
import { ReportEmailModal } from './ReportEmailModal';

interface Props {
  quotation: Quotation;
  isCart: boolean;
  onMakeCart: () => void;
  onConfirmed: (q: Quotation) => void;
  facets: CatalogFacets | null;
  tab: string;
  /** In the cart workspace the tabs switch locally instead of navigating. */
  onTab?: (tab: string) => void;
  onQuotation: (p: Quotation) => void;
  onError: (msg: string) => void;
}

const TABS: Array<{ id: string; label: string; hint: string }> = [
  { id: 'elenco', label: 'Line items', hint: 'Change a quantity or set your own price; totals update from the original cost analysis.' },
  { id: 'workbook', label: 'Cost breakdown', hint: 'Spreadsheet view of each line’s analysis. Click a cell to see where a number comes from and how it compares with past projects.' },
];

export function QuotationPage({ quotation, isCart, onMakeCart, onConfirmed, facets, tab, onTab, onQuotation, onError }: Props) {
  const activeTab = tab === 'workbook' ? 'workbook' : 'elenco';
  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [reportName, setReportName] = useState<string | undefined>();
  const [sheet, setSheet] = useState<ElencoCostiData | null>(null);
  const onData = useCallback((d: ElencoCostiData) => setSheet(d.quotationId === quotation.id ? d : null), [quotation.id]);
  const fallbackTotal = quotationCost(quotation);
  const current = sheet?.quotationId === quotation.id ? sheet : null;
  const total = current ? current.totals.totalCost : fallbackTotal;
  const parts = (current?.summary ?? [])
    .filter((s) => s.totalCost > 0)
    .map((s, i) => {
      const rows = current?.rows.filter((r) => r.position === s.position) ?? [];
      const first = rows[0];
      const label = first ? typologyOf({ title: first.description.split(/\r?\n/)[0], categoryName: null, description: first.description }).label : 'Other';
      return { position: s.position, label, total: s.totalCost, share: total > 0 ? s.totalCost / total : 0, tone: i % 6 };
    });
  const date = quotation.date ? new Date(quotation.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  const downloadExcel = async (): Promise<void> => {
    setExporting('excel');
    try {
      const res = await api.generate(quotation.id);
      await api.download(res.outputFile);
      setReportName(res.outputFile); setEmailOpen(true);
      onQuotation(await api.quotation(quotation.id));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(null);
    }
  };
  const setStatus = async (status: 'draft' | 'active'): Promise<void> => {
    try {
      const q = await api.updateQuotation(quotation.id, { status });
      onQuotation(q);
      if (status === 'active') onConfirmed(q);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  const downloadPdf = async (): Promise<void> => {
    setExporting('pdf');
    try {
      await api.downloadPdf(quotation.id, quotation.reference);
      setReportName(`${quotation.reference || 'quotation'} ELENCO COSTI.pdf`); setEmailOpen(true);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(null);
    }
  };
  return (
    <div className="q-page">
      <section className={`q-sheet ${isCart ? 'is-cart' : ''}`}>
        <div className="q-head">
          <div className="q-id">
            <div className="q-ref-line">
              <span className="q-number">{quotation.reference || 'No reference'}</span>
              <span className={`q-status ${quotation.status}`}>{quotation.status === 'active' ? 'Confirmed' : 'Draft'}</span>
              {isCart && (
                <span className="q-receiving" title="Products added from the catalog go into this draft">
                  Receiving products
                </span>
              )}
            </div>
            <h1 className="q-name">{quotation.name}</h1>
            <dl className="q-facts">
              <div>
                <dt>Customer</dt>
                <dd>{quotation.customer || 'Not set'}</dd>
              </div>
              <div>
                <dt>Date</dt>
                <dd>{date}</dd>
              </div>
              <div>
                <dt>Prepared by</dt>
                <dd>{quotation.estimator || '—'}</dd>
              </div>
              <div>
                <dt>Template</dt>
                <dd>{quotation.templateWorkbook.replace(/\s*Analisi\.xlsx$/i, '') || '—'}</dd>
              </div>
            </dl>
          </div>
          <div className="q-sum">
            <div className="q-sum-label">Estimated cost</div>
            <div className="q-sum-value">{fmtMoney(total)}</div>
            <div className="q-sum-sub">
              {quotation.items.length} {quotation.items.length === 1 ? 'line' : 'lines'}
              {current ? ` · ${fmtNum(current.totals.m2Total, 1)} m²` : ''}
              {current && !current.totals.complete ? ` · ${current.totals.rowsWithoutCost} without price` : ''}
            </div>
          </div>
        </div>

        {parts.length > 0 && (
          <div className="q-mix" aria-label="Where the cost goes">
            <div className="q-mix-bar">
              {parts.map((p) => (
                <span key={p.position} className={`tone-${p.tone}`} style={{ flexGrow: p.share }} title={`Position ${p.position}, ${p.label}: ${fmtMoney(p.total)} (${Math.round(p.share * 100)}%)`} />
              ))}
            </div>
            <ul className="q-mix-legend">
              {parts.map((p) => (
                <li key={p.position}>
                  <i className={`tone-${p.tone}`} aria-hidden="true" />
                  <span className="q-mix-name">
                    Pos. {p.position} · {p.label}
                  </span>
                  <span className="q-mix-amount">{fmtMoney(p.total)}</span>
                  <span className="q-mix-share">{Math.round(p.share * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="q-actions">
          {quotation.status === 'draft' ? (
            <button className="q-confirm" onClick={() => void setStatus('active')} disabled={quotation.items.length === 0} title="Confirm this draft quotation">
              Confirm quotation
            </button>
          ) : (
            <button onClick={() => void setStatus('draft')}>Reopen as draft</button>
          )}
          <div className="q-export">
            <button onClick={() => void downloadExcel()} disabled={!!exporting || quotation.items.length === 0} title="Builds the Analisi workbook (DATI GEN., ELENCO COSTI, one analysis sheet per item) from the template">
              {exporting === 'excel' ? (
                <>
                  <span className="spinner" /> Building Excel…
                </>
              ) : (
                'Download Excel'
              )}
            </button>
            <button onClick={() => void downloadPdf()} disabled={!!exporting || quotation.items.length === 0}>
              {exporting === 'pdf' ? 'Preparing PDF…' : 'Download PDF'}
            </button>
          </div>
          <span className="q-actions-gap" />
          <button className="q-quiet" onClick={() => navigate({ page: 'catalog' })}>
            Add products
          </button>
          <button className="q-quiet" onClick={() => setEmailOpen(true)}>
            Email contacts
          </button>
          <button className="q-quiet" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Close details' : 'Edit details'}
          </button>
          {quotation.status === 'draft' && !isCart && (
            <button className="q-quiet" onClick={onMakeCart}>
              Send catalog products here
            </button>
          )}
        </div>
        {editing && (
          <div className="q-edit">
            <QuotationForm
              facets={facets}
              quotation={quotation}
              onSaved={(p) => {
                onQuotation(p);
                setEditing(false);
              }}
              onError={onError}
            />
          </div>
        )}
      </section>
      <div className="q-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={activeTab === t.id} className={activeTab === t.id ? 'active' : ''} onClick={() => (onTab ? onTab(t.id) : navigate({ page: 'quotation', id: quotation.id, tab: t.id }))}>
            {t.label}
          </button>
        ))}
      </div>
      <p className="q-tab-hint">{TABS.find((t) => t.id === activeTab)?.hint}</p>
      {activeTab === 'elenco' && <ElencoCosti quotation={quotation} onQuotation={onQuotation} onError={onError} onData={onData} />}
      {activeTab === 'workbook' && <WorkbookView quotation={quotation} onQuotation={onQuotation} onError={onError} />}
      {emailOpen && <ReportEmailModal quotation={quotation} reportName={reportName} onClose={() => setEmailOpen(false)} />}
    </div>
  );
}
