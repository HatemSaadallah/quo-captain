import { useState } from 'react';
import type { CatalogFacets, CatalogRecord, Quotation } from '../api';
import { QuotationForm } from './QuotationForm';

interface Props {
  record: CatalogRecord;
  quotations: Quotation[];
  facets: CatalogFacets | null;
  estimator: string;
  onAdd: (record: CatalogRecord, quotationId: string) => Promise<boolean>;
  onError: (message: string) => void;
}

export function AddProductButton({ record, quotations, facets, estimator, onAdd, onError }: Props) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const [query, setQuery] = useState('');
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (q: Quotation): boolean => !words.length || words.every((w) => `${q.reference} ${q.name} ${q.customer} ${q.projectName ?? ''}`.toLowerCase().includes(w));
  const drafts = quotations.filter((q) => q.status === 'draft' && matches(q));
  const finished = quotations.filter((q) => q.status === 'active' && matches(q));

  const add = async (quotationId: string): Promise<void> => {
    setBusy(true);
    const ok = await onAdd(record, quotationId);
    setBusy(false);
    if (ok) {
      setAdded(true);
      setOpen(false);
      window.setTimeout(() => setAdded(false), 1600);
    }
  };

  return (
    <>
      <button
        type="button"
        className="add-product-button"
        aria-label={`Add ${record.title ?? record.itemCode ?? 'product'} to quotation`}
        disabled={busy}
        onClick={() => setOpen(true)}
      >{busy ? 'Adding…' : added ? 'Added ✓' : 'Add'}</button>
      {open && !creating && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <section className="panel add-quotation-modal" role="dialog" aria-modal="true" aria-labelledby="add-product-title">
            <h2 id="add-product-title">Add to a quotation</h2>
            <p className="small muted">Choose where to add <strong>{record.title ?? record.itemCode ?? 'this product'}</strong>.</p>
            <button type="button" className="create-quotation-choice top" onClick={() => { setOpen(false); setCreating(true); }}>＋ Create a new draft quotation with this product</button>
            <input className="quotation-search" type="search" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search quotations by reference, name or customer…" aria-label="Search quotations" />
            <div className="quotation-choice-scroll">
              {drafts.length > 0 && <div className="quotation-choice-group"><h3>Draft quotations</h3>{drafts.map((q) => <button type="button" className="quotation-choice" key={q.id} disabled={busy} onClick={() => void add(q.id)}><span><strong>{q.reference}</strong><small>{q.name}{q.customer ? ` · ${q.customer}` : ''}</small></span><span aria-hidden="true">→</span></button>)}</div>}
              {finished.length > 0 && <div className="quotation-choice-group"><h3>Finished quotations</h3>{finished.map((q) => <button type="button" className="quotation-choice" key={q.id} disabled={busy} onClick={() => void add(q.id)}><span><strong>{q.reference}</strong><small>{q.name}{q.customer ? ` · ${q.customer}` : ''}</small></span><span aria-hidden="true">→</span></button>)}</div>}
              {!drafts.length && !finished.length && <p className="small muted">No quotation matches “{query}”. Create a new draft instead.</p>}
            </div>
            <div className="row modal-actions"><button type="button" onClick={() => setOpen(false)}>Cancel</button></div>
          </section>
        </div>
      )}
      {creating && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setCreating(false)}>
          <section className="panel add-quotation-modal" role="dialog" aria-modal="true" aria-labelledby="new-draft-title">
            <h2 id="new-draft-title">New draft quotation</h2>
            <p className="small muted">Enter the quotation details. This product will be added after the draft is created.</p>
            <QuotationForm
              facets={facets}
              estimator={estimator}
              onError={onError}
              onSaved={async (quotation) => {
                setCreating(false);
                setBusy(true);
                const ok = await onAdd(record, quotation.id); // the product goes straight into the new draft
                setBusy(false);
                if (ok) {
                  setAdded(true);
                  window.setTimeout(() => setAdded(false), 1600);
                }
              }}
              submitLabel="Create draft & add product"
            />
            <button type="button" onClick={() => setCreating(false)}>Cancel</button>
          </section>
        </div>
      )}
    </>
  );
}
