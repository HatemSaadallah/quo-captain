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
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const drafts = quotations.filter((q) => q.status === 'draft');
  const finished = quotations.filter((q) => q.status === 'active');

  const add = async (quotationId: string): Promise<void> => {
    setBusy(true);
    const ok = await onAdd(record, quotationId);
    setBusy(false);
    if (ok) {
      setAdded(true);
      window.setTimeout(() => setAdded(false), 1600);
    }
  };

  return (
    <>
      <select
        className="add-product-select"
        aria-label={`Add ${record.title ?? record.itemCode ?? 'product'} to quotation`}
        value=""
        disabled={busy}
        onChange={(e) => {
          const id = e.target.value;
          if (id === '__new__') setCreating(true);
          else if (id) void add(id);
          e.currentTarget.value = '';
        }}
      >
        <option value="" disabled>{busy ? 'Adding…' : added ? 'Added ✓' : 'Add+'}</option>
        {drafts.length > 0 && <optgroup label="Draft quotations">{drafts.map((q) => <option key={q.id} value={q.id}>{q.reference} · {q.name}</option>)}</optgroup>}
        {finished.length > 0 && <optgroup label="Finished quotations">{finished.map((q) => <option key={q.id} value={q.id}>{q.reference} · {q.name}</option>)}</optgroup>}
        <option value="__new__">Create a new draft quotation…</option>
      </select>
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
                await onAdd(record, quotation.id);
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
