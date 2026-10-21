import { fmtMoney, type Quotation } from '../api';
import { navigate } from '../route';

interface Props {
  quotations: Quotation[];
  onDelete: (p: Quotation) => void;
}

const estimate = (p: Quotation): number => p.items.reduce((acc, it) => acc + (it.unitCostOverride ?? it.historicalUnitCost ?? 0) * it.quantity, 0);

export function QuotationList({ quotations, onDelete }: Props) {
  return (
    <section className="panel">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Quotations</h2>
        <button className="primary" onClick={() => navigate({ page: 'new', step: 1 })}>
          + New quotation
        </button>
      </div>
      <table className="data" style={{ marginTop: 10 }}>
        <thead>
          <tr>
            <th>Reference</th>
            <th>Name</th>
            <th>Customer</th>
            <th>Date</th>
            <th>Template</th>
            <th className="num">Rows</th>
            <th className="num">Indicative total</th>
            <th>Last export</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {quotations.map((p) => (
            <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate({ page: 'quotation', id: p.id, tab: 'elenco' })}>
              <td>
                <b>{p.reference || '(no ref)'}</b>
              </td>
              <td>{p.name}</td>
              <td>{p.customer}</td>
              <td>{p.date}</td>
              <td className="small">{p.templateWorkbook.replace(' Analisi.xlsx', '')}</td>
              <td className="num">{p.items.length}</td>
              <td className="num">{fmtMoney(estimate(p))}</td>
              <td className="small">{p.generations[0] ? `${new Date(p.generations[0].at).toLocaleDateString()} · ${p.generations[0].status}` : '—'}</td>
              <td>
                <button
                  className="danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(p);
                  }}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
          {quotations.length === 0 && (
            <tr>
              <td colSpan={9} className="muted">
                No quotation yet. Create one and build its ELENCO COSTI from the historical catalog.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
