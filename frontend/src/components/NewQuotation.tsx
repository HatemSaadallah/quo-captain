import { api, fmtMoney, type CatalogFacets, type CatalogRecord, type Quotation } from '../api';
import { navigate } from '../route';
import { ElencoCosti } from './ElencoCosti';
import { ProductSearch } from './ProductSearch';
import { QuotationForm } from './QuotationForm';
import { WorkbookView } from './WorkbookView';

interface Props {
  facets: CatalogFacets | null;
  quotation: Quotation | null;
  step: number;
  onQuotation: (p: Quotation) => void;
  onAdd: (record: CatalogRecord, quantity: number, params: Array<{ cell: string; value: number | string | null }>) => Promise<void>;
  onError: (msg: string) => void;
}

const STEPS = ['Details', 'Select products', 'Review & export'];

/** Guided workflow: create the quotation, pick historical analyses, review the ELENCO COSTI and export. */
export function NewQuotation({ facets, quotation, step, onQuotation, onAdd, onError }: Props) {
  const go = (s: number): void => navigate({ page: 'new', id: quotation?.id, step: s });
  return (
    <div className="stack">
      <section className="panel">
        <h2 style={{ marginTop: 0 }}>New quotation</h2>
        <ol className="stepper">
          {STEPS.map((label, i) => (
            <li key={label} className={i + 1 === step ? 'active' : i + 1 < step ? 'done' : ''} onClick={() => (quotation || i === 0) && go(i + 1)}>
              <span className="n">{i + 1}</span> {label}
            </li>
          ))}
        </ol>
        {step === 1 && (
          <QuotationForm
            facets={facets}
            quotation={quotation ?? undefined}
            submitLabel={quotation ? 'Save and continue' : 'Create and continue'}
            onSaved={(p) => {
              onQuotation(p);
              navigate({ page: 'new', id: p.id, step: 2 });
            }}
            onError={onError}
          />
        )}
      </section>

      {step === 2 && quotation && (
        <div className="layout" style={{ padding: 0 }}>
          <ProductSearch facets={facets} canAdd onAdd={onAdd} onError={onError} addLabel={`Add to ${quotation.reference}`} />
          <section className="panel">
            <h2>Selected products · {quotation.reference}</h2>
            <table className="data">
              <thead>
                <tr>
                  <th>Pos.</th>
                  <th>Item</th>
                  <th>Description · source</th>
                  <th className="num">Qty</th>
                  <th className="num">Hist. unit cost</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {quotation.items.map((it) => (
                  <tr key={it.id}>
                    <td>{it.position}</td>
                    <td>{it.itemCode}</td>
                    <td>
                      {it.description.split('\n')[0]}
                      <div className="small muted">
                        <span className="chip">{it.sourceOfferNo ?? it.sourceWorkbook ?? 'free row'}</span> sheet {it.sourceSheet ?? '—'}
                      </div>
                    </td>
                    <td className="num">
                      {it.quantity} {it.unit}
                    </td>
                    <td className="num">{fmtMoney(it.historicalUnitCost)}</td>
                    <td>
                      <button className="danger" onClick={() => void api.removeItem(quotation.id, it.id).then(onQuotation).catch((e: unknown) => onError(String(e)))}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
                {quotation.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
                      Search the catalog on the left and add the analyses this quotation needs. Quantities and parameters can be adjusted now or in the review step.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="row" style={{ marginTop: 10 }}>
              <button onClick={() => go(1)}>← Back</button>
              <button className="primary" disabled={quotation.items.length === 0} onClick={() => go(3)}>
                Continue to review →
              </button>
            </div>
          </section>
        </div>
      )}

      {step === 3 && quotation && (
        <div className="stack">
          <ElencoCosti quotation={quotation} onQuotation={onQuotation} onError={onError} />
          <WorkbookView quotation={quotation} onQuotation={onQuotation} onError={onError} />
          <section className="panel row">
            <button onClick={() => go(2)}>← Add more products</button>
            <button className="primary" onClick={() => navigate({ page: 'quotation', id: quotation.id, tab: 'elenco' })}>
              Finish · open quotation
            </button>
          </section>
        </div>
      )}
      {step > 1 && !quotation && <section className="panel muted">Create the quotation first.</section>}
    </div>
  );
}
