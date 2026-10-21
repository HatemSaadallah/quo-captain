import { useState, type ReactNode } from 'react';
import { fmtMoney, type CatalogFacets, type Quotation } from '../api';
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

const totalOf = (q: Quotation): number => q.items.reduce((acc, it) => acc + (it.unitCostOverride ?? it.historicalUnitCost ?? 0) * it.quantity, 0);

/** Several draft quotations ("carts") open side by side, one per project; the selected one receives catalog adds. */
export function CartWorkspace({ drafts, current, facets, estimator, onError, onSelect, onCreated, children }: Props) {
  const [open, setCreating] = useState(false);
  const creating = open || drafts.length === 0;

  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>Draft Quotations</h1>
          <div className="muted small">Your drafts. Products you add from the catalog can go into any draft or finished quotation.</div>
        </div>
        <button onClick={() => navigate({ page: 'quotations', status: 'all' })}>All quotations →</button>
      </div>

      <div className="carts">
        {drafts.map((c) => (
          <button key={c.id} className={`cart-card ${current?.id === c.id ? 'on' : ''}`} onClick={() => onSelect(c.id)}>
            <div className="cc-top">
              <b>{c.reference || '(no ref)'}</b>
              <span className="cart-badge">{c.items.length}</span>
            </div>
            <div className="cc-name">{c.name}</div>
            <div className="cc-sub">
              {c.customer || 'no customer'} · {fmtMoney(totalOf(c))}
            </div>
            {current?.id === c.id && <div className="cc-active">● receiving products</div>}
          </button>
        ))}
        <button className="cart-card add" onClick={() => setCreating(true)}><span>＋</span>New Draft Quotation</button>
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
