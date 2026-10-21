import { useState, type ReactNode } from 'react';
import { fmtMoney, type Quotation } from '../api';
import { navigate } from '../route';

interface Props {
  carts: Quotation[];
  current: Quotation | null;
  customers: string[];
  onSelect: (id: string) => void;
  onNewCart: (name: string, customer: string) => Promise<void>;
  /** The open cart, rendered with the quotation page. */
  children: ReactNode;
}

const totalOf = (q: Quotation): number => q.items.reduce((acc, it) => acc + (it.unitCostOverride ?? it.historicalUnitCost ?? 0) * it.quantity, 0);

/** Several draft quotations ("carts") open side by side, one per project; the selected one receives catalog adds. */
export function CartWorkspace({ carts, current, customers, onSelect, onNewCart, children }: Props) {
  const [open, setCreating] = useState(false);
  const creating = open || carts.length === 0;
  const [name, setName] = useState('');
  const [customer, setCustomer] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async (): Promise<void> => {
    setBusy(true);
    await onNewCart(name.trim() || `Project ${carts.length + 1}`, customer.trim());
    setBusy(false);
    setCreating(false);
    setName('');
    setCustomer('');
  };

  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>Quotations</h1>
          <div className="muted small">Your open carts (draft quotations). Products you add from the catalog go into the selected cart.</div>
        </div>
        <button onClick={() => navigate({ page: 'quotations', status: 'all' })}>All quotations →</button>
      </div>

      <div className="carts">
        {carts.map((c) => (
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
        {creating ? (
          <form
            className="cart-card new-form"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name, e.g. Nave 9 - Balconies" aria-label="cart project name" />
            <input list="cart-customers" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Customer" aria-label="cart customer" />
            <datalist id="cart-customers">
              {customers.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <div className="row">
              <button className="primary" type="submit" disabled={busy}>
                {busy ? 'Creating…' : 'Create cart'}
              </button>
              {carts.length > 0 && (
                <button type="button" onClick={() => setCreating(false)}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        ) : (
          <button className="cart-card add" onClick={() => setCreating(true)}>
            <span>＋</span>
            New cart
          </button>
        )}
      </div>

      {current ? (
        children
      ) : (
        <section className="panel empty-cart">
          <h2>No cart open</h2>
          <p className="muted">Create a cart for a project, then add products from the catalog.</p>
          <button className="primary" onClick={() => navigate({ page: 'catalog' })}>
            Browse catalog
          </button>
        </section>
      )}
    </div>
  );
}
