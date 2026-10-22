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
  onCreated: (quotation: Quotation) => void;
  /** The selected draft, rendered with the quotation page. */
  children: ReactNode;
}

/** Several draft quotations ("carts") open side by side, one per project; the selected one receives catalog adds. */
export function CartWorkspace({ drafts, current, facets, estimator, onError, onSelect, onCreated, children }: Props) {
  const [open, setCreating] = useState(false);
  const creating = open || drafts.length === 0;

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
          <button key={c.id} role="tab" aria-selected={current?.id === c.id} className={`q-draft ${current?.id === c.id ? 'on' : ''}`} onClick={() => onSelect(c.id)} title={`${c.name} · ${c.customer || 'no customer'}`}>
            <span className="q-draft-ref">
              {c.reference || 'No ref'} <span className="q-draft-count">{c.items.length}</span>
            </span>
            <span className="q-draft-name">{c.name}</span>
            <span className="q-draft-sum">{c.customer || 'No customer'}</span>
          </button>
        ))}
        <button className="q-draft q-draft-new" onClick={() => setCreating(true)}>
          <span aria-hidden="true">＋</span> New draft
        </button>
      </div>

      {creating && (
        <div className="modal-backdrop" role="presentation">
          <section className="panel add-quotation-modal" role="dialog" aria-modal="true" aria-labelledby="workspace-new-draft-title">
            <h2 id="workspace-new-draft-title">New draft quotation</h2>
            <QuotationForm facets={facets} estimator={estimator} onError={onError} onSaved={(quotation) => { onCreated(quotation); setCreating(false); }} submitLabel="Create draft quotation" />
            {drafts.length > 0 && <button type="button" onClick={() => setCreating(false)}>Cancel</button>}
          </section>
        </div>
      )}

      {current ? (
        children
      ) : (
        <section className="panel empty-cart">
          <h2>No draft quotation selected</h2>
          <p className="muted">Create a draft quotation with its basic details, then add products from the catalog.</p>
          <button className="primary" onClick={() => navigate({ page: 'catalog' })}>
            Browse catalog
          </button>
        </section>
      )}
    </div>
  );
}
