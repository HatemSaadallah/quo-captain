import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { api, getToken, onUnauthorized, type AuthUser, type CatalogFacets, type CatalogRecord, type Quotation } from './api';
import { CartWorkspace } from './components/CartWorkspace';
import { ContactsPage } from './components/ContactsPage';
import { ProductHome } from './components/ProductHome';
import { ProductPage } from './components/ProductPage';
import { Login } from './components/Login';
import { NewQuotation } from './components/NewQuotation';
import { QuotationList } from './components/QuotationList';
import { QuotationPage } from './components/QuotationPage';
import { cleanTitle } from './product';
import { navigate, useRoute } from './route';

export default function App() {
  const route = useRoute();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined); // undefined = checking stored token
  const [facets, setFacets] = useState<CatalogFacets | null>(null);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cartId, setCartIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem('somec.cart');
    } catch {
      return null;
    }
  });
  const [toast, setToast] = useState<{ text: string; quotationId: string } | null>(null);
  const setCartId = (id: string): void => {
    setCartIdState(id);
    try {
      localStorage.setItem('somec.cart', id);
    } catch {
      // per-browser convenience only
    }
  };

  useEffect(() => {
    onUnauthorized(() => {
      setUser(null);
      setQuotations([]);
    });
    if (!getToken()) {
      setUser(null);
      return;
    }
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null));
    return () => onUnauthorized(null);
  }, []);

  const loadQuotations = useCallback(async (): Promise<void> => {
    try {
      setQuotations(await api.quotations());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    api.facets().then(setFacets).catch((e: unknown) => setError(`Backend not reachable: ${e instanceof Error ? e.message : String(e)}`));
    void loadQuotations();
  }, [user, loadQuotations]);

  /** Replace one quotation in the list (and refresh the list in the background). */
  const onQuotation = useCallback(
    (p: Quotation): void => {
      setQuotations((list) => (list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [p, ...list]));
      void loadQuotations();
    },
    [loadQuotations],
  );

  const addTo = async (quotationId: string, record: CatalogRecord, quantity: number, params: Array<{ cell: string; value: number | string | null }>): Promise<void> => {
    try {
      let p = await api.addItem(quotationId, { catalogId: record.id, quantity });
      const added = p.items[p.items.length - 1];
      const changed = params.filter((x) => added.params.find((ap) => ap.cell === x.cell)?.value !== x.value);
      if (changed.length) p = await api.updateItem(p.id, added.id, { params: changed });
      onQuotation(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  /** The cart is a draft quotation; adding with no draft open starts a new draft with the next offer number. */
  const drafts = quotations.filter((q) => q.status === 'draft').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const cart = drafts.find((q) => q.id === cartId) ?? drafts[0] ?? null;
  const [workspaceTab, setWorkspaceTab] = useState('elenco');
  const newCart = async (name = 'Draft quotation', customer = ''): Promise<Quotation> => {
    const next = Math.max(2099, ...quotations.map((q) => Number(/TM(\d{4})/.exec(q.reference)?.[1] ?? 0))) + 1;
    const created = await api.createQuotation({ status: 'draft', name, customer, reference: `TM${next}-00`, date: new Date().toISOString().slice(0, 10), estimator: user?.name, templateWorkbook: facets?.workbooks[0]?.workbook });
    onQuotation(created);
    setCartId(created.id);
    return created;
  };
  const addToCart = async (record: CatalogRecord, quantity = 1): Promise<void> => {
    try {
      const target = cart ?? (await newCart());
      setCartId(target.id);
      await addTo(target.id, record, quantity, []);
      setToast({ text: `${cleanTitle(record)} added to ${target.reference || target.name}`, quotationId: target.id });
      window.setTimeout(() => setToast(null), 4500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const deleteQuotation = async (p: Quotation): Promise<void> => {
    if (!confirm(`Delete quotation "${p.reference || p.name}" and its rows?`)) return;
    try {
      await api.deleteQuotation(p.id);
      setQuotations((list) => list.filter((x) => x.id !== p.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const logout = (): void => {
    api.logout();
    setUser(null);
    setQuotations([]);
    setFacets(null);
  };

  if (user === undefined) return <main className="login muted">Checking session…</main>;
  if (!user) return <Login onLogin={setUser} />;

  const current = route.page === 'quotation' || route.page === 'new' ? (quotations.find((p) => p.id === route.id) ?? null) : null;
  const navItem = (page: 'catalog' | 'quotations' | 'contacts', label: string, icon: string, active: boolean): ReactElement => (
    <button className={`nav-item ${active ? 'active' : ''}`} onClick={() => navigate(page === 'quotations' ? { page: 'quotations' } : { page })}>
      <span className="icon">{icon}</span> {label}
    </button>
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">S</div>
          <div>
            <div className="title">Somec</div>
            <div className="sub">Quotation cost analysis</div>
          </div>
        </div>
        <nav>
          {navItem('catalog', 'Catalog', '▦', route.page === 'catalog' || route.page === 'product')}
          {navItem('quotations', 'Quotations', '≣', route.page === 'quotations' || route.page === 'quotation' || route.page === 'new')}
          {navItem('contacts', 'Contacts', '☎', route.page === 'contacts')}
        </nav>
        <div className="carts-nav">
          <div className="carts-head">Carts</div>
          {drafts.slice(0, 6).map((d) => (
            <button
              key={d.id}
              className={`cart-nav ${cart?.id === d.id ? 'active' : ''}`}
              onClick={() => {
                setCartId(d.id);
                navigate({ page: 'quotations' });
              }}
            >
              <span className="icon">🛒</span>
              <span className="cart-text">
                {d.reference || '(no ref)'}
                <small>{d.name}</small>
              </span>
              <span className="cart-badge">{d.items.length}</span>
            </button>
          ))}
          {drafts.length > 6 && (
            <button className="carts-more" onClick={() => navigate({ page: 'quotations', status: 'draft' })}>
              +{drafts.length - 6} more carts
            </button>
          )}
          <button
            className="carts-new"
            onClick={() =>
              void newCart()
                .then(() => navigate({ page: 'quotations' }))
                .catch((e: unknown) => setError(String(e)))
            }
          >
            ＋ New cart
          </button>
        </div>
        <div className="sidebar-foot small">
          <div>{facets ? `${facets.recordCount} analyses · ${facets.workbooks.length} workbooks` : 'loading catalog…'}</div>
          <div className="muted">costs are estimated costs, not selling prices</div>
          <div style={{ marginTop: 8 }}>
            {user.name} <span className="muted">({user.role})</span>
          </div>
          <button onClick={logout} style={{ marginTop: 4, padding: '2px 8px' }}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        {error && (
          <div className="error-box" style={{ marginBottom: 12 }}>
            {error}{' '}
            <button onClick={() => setError(null)} style={{ padding: '0 6px' }}>
              ×
            </button>
          </div>
        )}
        {route.page === 'catalog' && <ProductHome facets={facets} onError={setError} onAddToCart={(r) => addToCart(r)} />}
        {route.page === 'product' && <ProductPage id={route.id} cart={cart} quotations={drafts} onCart={setCartId} onAddToCart={addToCart} onError={setError} />}
        {route.page === 'contacts' && <ContactsPage quotations={quotations} />}
        {route.page === 'quotations' && !route.status && (
          <CartWorkspace carts={drafts} current={cart} customers={[...new Set(quotations.map((q) => q.customer).filter(Boolean))]} onSelect={setCartId} onNewCart={async (n, c) => void (await newCart(n, c))}>
            {cart && (
              <QuotationPage
                quotation={cart}
                isCart
                onMakeCart={() => undefined}
                onConfirmed={(q) => {
                  setToast({ text: `${q.reference || q.name} confirmed · now an active quotation`, quotationId: q.id });
                  window.setTimeout(() => setToast(null), 4500);
                }}
                facets={facets}
                tab={workspaceTab}
                onTab={setWorkspaceTab}
                onQuotation={onQuotation}
                onAdd={(r, q, prm) => addTo(cart.id, r, q, prm)}
                onError={setError}
              />
            )}
          </CartWorkspace>
        )}
        {route.page === 'quotations' && route.status && <QuotationList quotations={quotations} cartId={cart?.id ?? null} status={route.status} onDelete={(p) => void deleteQuotation(p)} />}
        {route.page === 'quotation' && (current ? <QuotationPage quotation={current} isCart={cart?.id === current.id} onMakeCart={() => setCartId(current.id)}
            onConfirmed={(q) => {
              setToast({ text: `${q.reference || q.name} confirmed · now an active quotation`, quotationId: q.id });
              window.setTimeout(() => setToast(null), 4500);
            }} facets={facets} tab={route.tab} onQuotation={onQuotation} onAdd={(r, q, prm) => addTo(current.id, r, q, prm)} onError={setError} /> : <section className="panel muted">{quotations.length ? 'Quotation not found.' : 'Loading…'}</section>)}
        {route.page === 'new' && <NewQuotation facets={facets} quotation={current} step={route.step} onQuotation={onQuotation} onAdd={(r, q, prm) => (current ? addTo(current.id, r, q, prm) : Promise.resolve())} onError={setError} />}
      </main>
      {toast && (
        <div className="toast" role="status">
          <span className="toast-ok">✓</span>
          <span>{toast.text}</span>
          <button
            onClick={() => {
              setCartId(toast.quotationId);
              navigate(quotations.find((q) => q.id === toast.quotationId)?.status === 'draft' ? { page: 'quotations' } : { page: 'quotation', id: toast.quotationId, tab: 'elenco' });
            }}
          >
            View cart →
          </button>
        </div>
      )}
    </div>
  );
}
