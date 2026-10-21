import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { api, getToken, onUnauthorized, type AuthUser, type CatalogFacets, type CatalogRecord, type Quotation } from './api';
import { ProductHome } from './components/ProductHome';
import { ProductPage } from './components/ProductPage';
import { Login } from './components/Login';
import { NewQuotation } from './components/NewQuotation';
import { QuotationList } from './components/QuotationList';
import { QuotationPage } from './components/QuotationPage';
import { navigate, useRoute } from './route';

export default function App() {
  const route = useRoute();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined); // undefined = checking stored token
  const [facets, setFacets] = useState<CatalogFacets | null>(null);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [error, setError] = useState<string | null>(null);

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
  const navItem = (page: 'catalog' | 'quotations' | 'new', label: string, icon: string, active: boolean): ReactElement => (
    <button className={`nav-item ${active ? 'active' : ''}`} onClick={() => navigate(page === 'new' ? { page: 'new', step: 1 } : { page })}>
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
          {navItem('quotations', 'Quotations', '≣', route.page === 'quotations' || route.page === 'quotation')}
          {navItem('new', 'New quotation', '＋', route.page === 'new')}
        </nav>
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
        {route.page === 'catalog' && <ProductHome facets={facets} onError={setError} />}
        {route.page === 'product' && <ProductPage id={route.id} quotations={quotations} onAdd={(qid, r, q) => addTo(qid, r, q, [])} onError={setError} />}
        {route.page === 'quotations' && <QuotationList quotations={quotations} onDelete={(p) => void deleteQuotation(p)} />}
        {route.page === 'quotation' && (current ? <QuotationPage quotation={current} facets={facets} tab={route.tab} onQuotation={onQuotation} onAdd={(r, q, prm) => addTo(current.id, r, q, prm)} onError={setError} /> : <section className="panel muted">{quotations.length ? 'Quotation not found.' : 'Loading…'}</section>)}
        {route.page === 'new' && <NewQuotation facets={facets} quotation={current} step={route.step} onQuotation={onQuotation} onAdd={(r, q, prm) => (current ? addTo(current.id, r, q, prm) : Promise.resolve())} onError={setError} />}
      </main>
    </div>
  );
}
