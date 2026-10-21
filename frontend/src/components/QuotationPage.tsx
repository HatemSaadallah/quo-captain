import { useState } from 'react';
import { api, fmtMoney, type CatalogFacets, type CatalogRecord, type Quotation } from '../api';
import { navigate } from '../route';
import { Cart } from './Cart';
import { ElencoCosti } from './ElencoCosti';
import { ProductSearch } from './ProductSearch';
import { QuotationForm } from './QuotationForm';
import { WorkbookView } from './WorkbookView';

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
  onAdd: (record: CatalogRecord, quantity: number, params: Array<{ cell: string; value: number | string | null }>) => Promise<void>;
  onError: (msg: string) => void;
}

const TABS: Array<{ id: string; label: string; hint: string }> = [
  { id: 'elenco', label: 'Items & costs', hint: 'Every product in this quotation with quantity, unit cost and total (the ELENCO COSTI sheet). Edit quantities or override a cost here.' },
  { id: 'workbook', label: 'Cost breakdown', hint: 'Spreadsheet view of each item’s cost analysis. Click a cell to see where the number comes from and how it compares with past projects.' },
  { id: 'products', label: 'Add products', hint: 'Search the catalog and add products to this quotation.' },
  { id: 'export', label: 'Checks & exports', hint: 'Checks that run before exporting, and the Excel files generated so far.' },
];

export function QuotationPage({ quotation, isCart, onMakeCart, onConfirmed, facets, tab, onTab, onQuotation, onAdd, onError }: Props) {
  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);
  const total = quotation.items.reduce((acc, it) => acc + (it.unitCostOverride ?? it.historicalUnitCost ?? 0) * it.quantity, 0);

  const downloadExcel = async (): Promise<void> => {
    setExporting('excel');
    try {
      const res = await api.generate(quotation.id);
      await api.download(res.outputFile);
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
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(null);
    }
  };
  return (
    <div className="stack">
      <section className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0 }}>
              {quotation.reference || '(no reference)'} · {quotation.name} <span className={`status-badge ${quotation.status}`}>{quotation.status === 'active' ? 'Active' : 'Draft'}</span>
            </h2>
            <div className="small muted">
              {quotation.customer || 'no customer'} · {quotation.date} · estimator {quotation.estimator || '—'} · {quotation.items.length} items · <b>{fmtMoney(total)}</b> estimated cost
              {isCart && <span className="cart-pill">cart</span>}
            </div>
          </div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className="primary" onClick={() => void downloadExcel()} disabled={!!exporting || quotation.items.length === 0} title="Builds the Analisi workbook (DATI GEN., ELENCO COSTI, one analysis sheet per item) from the template">
              {exporting === 'excel' ? (
                <>
                  <span className="spinner" /> Building Excel…
                </>
              ) : (
                '⬇ Download Excel'
              )}
            </button>
            <button onClick={() => void downloadPdf()} disabled={!!exporting || quotation.items.length === 0}>
              {exporting === 'pdf' ? 'Preparing PDF…' : '⬇ PDF'}
            </button>
            {quotation.status === 'draft' ? (
              <button className="confirm" onClick={() => void setStatus('active')} disabled={quotation.items.length === 0} title="Confirm the draft: it becomes an active quotation and the cart starts empty">
                ✓ Confirm quotation
              </button>
            ) : (
              <button onClick={() => void setStatus('draft')}>Reopen as draft</button>
            )}
            {quotation.status === 'draft' && !isCart && <button onClick={onMakeCart}>Use as cart</button>}
            <button onClick={() => navigate({ page: 'catalog' })}>+ Add products</button>
            <button onClick={() => setEditing((v) => !v)}>{editing ? 'Close' : 'Edit details'}</button>
          </div>
        </div>
        {editing && (
          <div style={{ marginTop: 10 }}>
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
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => (onTab ? onTab(t.id) : navigate({ page: 'quotation', id: quotation.id, tab: t.id }))}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="tab-hint">{TABS.find((t) => t.id === tab)?.hint}</div>
      {tab === 'elenco' && <ElencoCosti quotation={quotation} onQuotation={onQuotation} onError={onError} />}
      {tab === 'workbook' && <WorkbookView quotation={quotation} onQuotation={onQuotation} onError={onError} />}
      {tab === 'products' && <ProductSearch facets={facets} canAdd onAdd={onAdd} onError={onError} addLabel={`Add to ${quotation.reference || 'quotation'}`} />}
      {tab === 'export' && <Cart quotation={quotation} onQuotation={onQuotation} onError={onError} />}
    </div>
  );
}
