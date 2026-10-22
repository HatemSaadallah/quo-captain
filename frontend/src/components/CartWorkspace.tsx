import { useState, type ReactNode } from 'react';
import { type CatalogFacets, type Quotation } from '../api';
import { navigate } from '../route';
import { QuotationForm } from './QuotationForm';

interface Props {
  drafts: Quotation[];
  current: Quotation | null;
  facets: CatalogFacets | null;
  estimator: string;
  onError: (message: string) => void;
  onSelect: (id: string) => void;
  onDelete: (quotation: Quotation) => void;
  onCreated: (quotation: Quotation) => void;
  /** The selected draft, rendered with the quotation page. */
  children: ReactNode;
}

/** Several draft quotations ("carts") open side by side, one per project; the selected one receives catalog adds. */
export function CartWorkspace({ drafts, current, facets, estimator, onError, onSelect, onDelete, onCreated, children }: Props) {
  const [open, setCreating] = useState(false);
  const creating = open;

  return (
    <div className="q-workspace">
      <div className="q-workspace-head">
        <div>
          <h1>Draft quotations</h1>
          <p className="muted">One draft per project. Products you add from the catalog go into the draft marked as receiving products.</p>
        </div>
        <button onClick={() => navigate({ page: 'quotations', status: 'all' })}>All quotations</button>
      </div>

      <div className="q-drafts" role="tablist" aria-label="Draft quotations">
        {drafts.map((c) => (
          <div key={c.id} className={`q-draft-wrap ${current?.id === c.id ? 'on' : ''}`}>
            <button role="tab" aria-selected={current?.id === c.id} className={`q-draft ${current?.id === c.id ? 'on' : ''}`} onClick={() => onSelect(c.id)} title={`${c.name} · ${c.customer || 'no customer'}`}>
              <span className="q-draft-ref">
                {c.reference || 'No ref'} <span className="q-draft-count">{c.items.length}</span>
              </span>
              <span className="q-draft-name">{c.name}</span>
              <span className="q-draft-sum">{c.customer || 'No customer'}</span>
            </button>
            <button className="q-draft-delete" onClick={() => onDelete(c)} aria-label={`Delete draft ${c.reference || c.name}`} title="Delete this draft">
              ×
            </button>
          </div>
        ))}
        <button className="q-draft q-draft-new" onClick={() => setCreating(true)}>
          <span aria-hidden="true">＋</span> New draft
        </button>
      </div>

      {creating && (
        <div className="modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && setCreating(false)} onKeyDown={(e) => e.key === 'Escape' && setCreating(false)}>
          <section className="panel add-quotation-modal" role="dialog" aria-modal="true" aria-labelledby="workspace-new-draft-title">
            <div className="modal-title-row">
              <h2 id="workspace-new-draft-title">New draft quotation</h2>
              <button type="button" className="modal-close" aria-label="Close" onClick={() => setCreating(false)}>
                ×
              </button>
            </div>
            <QuotationForm facets={facets} estimator={estimator} onError={onError} onSaved={(quotation) => { onCreated(quotation); setCreating(false); }} submitLabel="Create draft quotation" />
            <button type="button" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </section>
        </div>
      )}

      {current ? (
        children
      ) : (
        <section className="panel empty-cart">
          <h2>No draft quotation yet</h2>
          <p className="muted">Start a draft for a project, import an existing Analisi workbook, or add products from the catalog.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="primary" onClick={() => setCreating(true)}>
              New draft
            </button>
            <button onClick={() => navigate({ page: 'import' })}>Import workbook</button>
            <button onClick={() => navigate({ page: 'catalog' })}>Browse catalog</button>
          </div>
        </section>
      )}
    </div>
  );
}
