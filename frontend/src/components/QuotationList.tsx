import { useEffect, useMemo, useState } from 'react';
import { fmtMoney, type Quotation } from '../api';
import { TYPOLOGIES, typologyOf } from '../product';
import { navigate } from '../route';

interface Props {
  quotations: Quotation[];
  cartId: string | null;
  status?: string;
  onDelete: (q: Quotation) => void;
}

type SortKey = 'reference' | 'name' | 'customer' | 'date' | 'rows' | 'total' | 'updated';

const itemTypology = (it: Quotation['items'][number]): string => typologyOf({ title: it.description.split('\n')[0], categoryName: null, description: it.description }).key;
const totalOf = (q: Quotation): number => q.items.reduce((acc, it) => acc + (it.unitCostOverride ?? it.historicalUnitCost ?? 0) * it.quantity, 0);
const typesOf = (q: Quotation): string[] => [...new Set(q.items.map(itemTypology))];

const PAGE_SIZES = [10, 25, 50];

export function QuotationList({ quotations, cartId, status, onDelete }: Props) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [text, setText] = useState('');
  const [product, setProduct] = useState('');
  const [type, setType] = useState('');
  const [customer, setCustomer] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 });

  const customers = useMemo(() => [...new Set(quotations.map((q) => q.customer).filter(Boolean))].sort(), [quotations]);

  const rows = useMemo(() => {
    const t = text.trim().toLowerCase();
    const p = product.trim().toLowerCase();
    const value = (q: Quotation): string | number => {
      switch (sort.key) {
        case 'rows':
          return q.items.length;
        case 'total':
          return totalOf(q);
        case 'updated':
          return q.updatedAt;
        default:
          return (q[sort.key] || '').toLowerCase();
      }
    };
    return quotations
      .filter((q) => !status || status === 'all' || q.status === status)
      .filter((q) => !t || `${q.reference} ${q.name} ${q.customer} ${q.estimator}`.toLowerCase().includes(t))
      .filter((q) => !p || q.items.some((it) => `${it.itemCode} ${it.description}`.toLowerCase().includes(p)))
      .filter((q) => !type || typesOf(q).includes(type))
      .filter((q) => !customer || q.customer === customer)
      .filter((q) => (!from || q.date >= from) && (!to || q.date <= to))
      .sort((a, b) => {
        const va = value(a);
        const vb = value(b);
        return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
      });
  }, [quotations, status, text, product, type, customer, from, to, sort]);

  useEffect(() => setPage(1), [status, text, product, type, customer, from, to, pageSize]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages);
  const visible = rows.slice((current - 1) * pageSize, current * pageSize);
  const count = (st?: string): number => quotations.filter((q) => !st || st === 'all' || q.status === st).length;

  const filtered = text || product || type || customer || from || to;
  const head = (key: SortKey, label: string, num = false) => (
    <th className={`sortable ${num ? 'num' : ''}`} onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'date' || key === 'total' || key === 'updated' ? -1 : 1 }))}>
      {label} <span className="sort-ind">{sort.key === key ? (sort.dir === 1 ? '▲' : '▼') : '↕'}</span>
    </th>
  );

  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>Quotations</h1>
          <div className="muted small">
            {rows.length} of {quotations.length} quotations · {fmtMoney(rows.reduce((s, q) => s + totalOf(q), 0))} estimated cost in view
          </div>
        </div>
        <button className="primary" onClick={() => navigate({ page: 'quotations' })}>
          🛒 Open carts
        </button>
      </div>

      <div className="status-tabs" role="tablist">
        {[
          { id: 'all', label: 'All quotations' },
          { id: 'active', label: 'Active' },
          { id: 'draft', label: 'Carts (drafts)' },
        ].map((t) => (
          <button key={t.label} role="tab" aria-selected={status === t.id} className={status === t.id ? 'on' : ''} onClick={() => navigate({ page: 'quotations', status: t.id })}>
            {t.label} <span>{count(t.id)}</span>
          </button>
        ))}
      </div>

      <section className="panel qfilters">
        <label className="field">
          Search
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Reference, name, customer…" />
        </label>
        <label className="field">
          Contains product
          <input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="e.g. windscreen, 03-01" />
        </label>
        <label className="field">
          Product type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {TYPOLOGIES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Customer
          <select value={customer} onChange={(e) => setCustomer(e.target.value)}>
            <option value="">All customers</option>
            {customers.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        {filtered && (
          <button
            className="clear"
            onClick={() => {
              setText('');
              setProduct('');
              setType('');
              setCustomer('');
              setFrom('');
              setTo('');
            }}
          >
            Clear filters
          </button>
        )}
      </section>

      <section className="panel" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="data qtable">
          <thead>
            <tr>
              {head('reference', 'Reference')}
              <th>Status</th>
              {head('name', 'Name')}
              {head('customer', 'Customer')}
              {head('date', 'Date')}
              <th>Product types</th>
              {head('rows', 'Items', true)}
              {head('total', 'Estimated cost', true)}
              {head('updated', 'Last change')}
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((q) => (
              <tr key={q.id} onClick={() => navigate({ page: 'quotation', id: q.id, tab: 'elenco' })}>
                <td>
                  <b>{q.reference || '(no ref)'}</b>
                  {q.id === cartId && <span className="cart-pill">cart</span>}
                </td>
                <td>
                  <span className={`status-badge ${q.status}`}>{q.status === 'active' ? 'Active' : 'Draft'}</span>
                </td>
                <td>{q.name}</td>
                <td>{q.customer || '—'}</td>
                <td>{q.date || '—'}</td>
                <td>
                  <div className="pmats">
                    {typesOf(q)
                      .map((k) => TYPOLOGIES.find((t) => t.key === k)?.label)
                      .filter(Boolean)
                      .slice(0, 3)
                      .map((l) => (
                        <span key={l} className="mat">
                          {l}
                        </span>
                      ))}
                  </div>
                </td>
                <td className="num">{q.items.length}</td>
                <td className="num">
                  <b>{fmtMoney(totalOf(q))}</b>
                </td>
                <td className="small muted">{new Date(q.updatedAt).toLocaleDateString()}</td>
                <td>
                  <button
                    className="danger"
                    title="Delete quotation"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(q);
                    }}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="muted" style={{ padding: 20 }}>
                  {quotations.length ? 'No quotation matches these filters.' : 'No quotation yet. Add a product to the cart from the catalog to start one.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="pager">
          <span className="muted small">
            {rows.length ? `${(current - 1) * pageSize + 1}–${Math.min(current * pageSize, rows.length)} of ${rows.length}` : '0 results'}
          </span>
          <label className="small muted">
            Rows per page{' '}
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} style={{ width: 'auto', padding: '2px 6px' }}>
              {PAGE_SIZES.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <div className="pager-btns">
            <button disabled={current === 1} onClick={() => setPage(1)} aria-label="first page">
              «
            </button>
            <button disabled={current === 1} onClick={() => setPage(current - 1)} aria-label="previous page">
              ‹
            </button>
            {Array.from({ length: pages }, (_, i) => i + 1)
              .filter((n) => n === 1 || n === pages || Math.abs(n - current) <= 1)
              .map((n, i, arr) => (
                <span key={n}>
                  {i > 0 && n - arr[i - 1] > 1 && <span className="muted"> … </span>}
                  <button className={n === current ? 'on' : ''} onClick={() => setPage(n)}>
                    {n}
                  </button>
                </span>
              ))}
            <button disabled={current === pages} onClick={() => setPage(current + 1)} aria-label="next page">
              ›
            </button>
            <button disabled={current === pages} onClick={() => setPage(pages)} aria-label="last page">
              »
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
