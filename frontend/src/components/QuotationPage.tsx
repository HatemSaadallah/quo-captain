import { useState } from 'react';
import { type CatalogFacets, type CatalogRecord, type Quotation } from '../api';
import { navigate } from '../route';
import { Cart } from './Cart';
import { ElencoCosti } from './ElencoCosti';
import { ProductSearch } from './ProductSearch';
import { QuotationForm } from './QuotationForm';
import { WorkbookView } from './WorkbookView';

interface Props {
  quotation: Quotation;
  facets: CatalogFacets | null;
  tab: string;
  onQuotation: (p: Quotation) => void;
  onAdd: (record: CatalogRecord, quantity: number, params: Array<{ cell: string; value: number | string | null }>) => Promise<void>;
  onError: (msg: string) => void;
}

const TABS: Array<{ id: string; label: string }> = [
  { id: 'elenco', label: 'ELENCO COSTI (web)' },
  { id: 'workbook', label: 'Generated workbook & PDF' },
  { id: 'products', label: 'Add products' },
  { id: 'export', label: 'Cart & Excel export' },
];

export function QuotationPage({ quotation, facets, tab, onQuotation, onAdd, onError }: Props) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="stack">
      <section className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0 }}>
              {quotation.reference || '(no reference)'} · {quotation.name}
            </h2>
            <div className="small muted">
              {quotation.customer} · {quotation.date} · estimator {quotation.estimator || '—'} · template {quotation.templateWorkbook} · {quotation.items.length} rows
            </div>
          </div>
          <div className="row">
            <button onClick={() => setEditing((v) => !v)}>{editing ? 'Close' : 'Edit details'}</button>
            <button onClick={() => navigate({ page: 'quotations' })}>All quotations</button>
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
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => navigate({ page: 'quotation', id: quotation.id, tab: t.id })}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'elenco' && <ElencoCosti quotation={quotation} onQuotation={onQuotation} onError={onError} />}
      {tab === 'workbook' && <WorkbookView quotation={quotation} onQuotation={onQuotation} onError={onError} />}
      {tab === 'products' && <ProductSearch facets={facets} canAdd onAdd={onAdd} onError={onError} addLabel={`Add to ${quotation.reference || 'quotation'}`} />}
      {tab === 'export' && <Cart quotation={quotation} onQuotation={onQuotation} onError={onError} />}
    </div>
  );
}
