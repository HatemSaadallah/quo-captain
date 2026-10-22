import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { api, getToken, onUnauthorized, type AuthUser, type CatalogFacets, type CatalogRecord, type Quotation } from './api';
import { CartWorkspace } from './components/CartWorkspace';
import { ContactsPage } from './components/ContactsPage';
import { InsightsPage } from './components/InsightsPage';
import { SharedInsight } from './components/SharedInsight';
import { ImportPage } from './components/ImportPage';
import { DashboardPage } from './components/DashboardPage';
import { ProjectsPage } from './components/ProjectsPage';
import { ProjectFinder } from './components/ProjectFinder';
import { CustomersPage } from './components/CustomersPage';
import { MaterialsPage } from './components/MaterialsPage';
import { ProductHome } from './components/ProductHome';
import { ProductPage } from './components/ProductPage';
import { Login } from './components/Login';
import { NewQuotation } from './components/NewQuotation';
import { QuotationList } from './components/QuotationList';
import { QuotationPage } from './components/QuotationPage';
import { WorkspaceAssistant } from './components/WorkspaceAssistant';
import { Icon, type IconName } from './components/Icon';
import { setCustomImages } from './product';
import { navigate, useRoute } from './route';
import { currentTextSize, currentTheme, setTextSize, setTheme } from './theme';

export default function App() {
  const route = useRoute();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined); // undefined = checking stored token
  const [facets, setFacets] = useState<CatalogFacets | null>(null);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [, setImagesVersion] = useState(0); // re-render once custom product images are known
  const [theme, setThemeState] = useState(currentTheme);
  const [textSize, setTextSizeState] = useState(currentTextSize);
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
    api.catalogImages().then((m) => { setCustomImages(m); setImagesVersion((v) => v + 1); }).catch(() => undefined);
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

  const addTo = async (quotationId: string, record: CatalogRecord, quantity: number, params: Array<{ cell: string; value: number | string | null }>, custom?: { L: number | null; H: number | null; description: string; lotto?: string; notes?: string }): Promise<boolean> => {
    try {
      let p = await api.addItem(quotationId, { catalogId: record.id, quantity });
      const added = p.items[p.items.length - 1];
      const changed = params.filter((x) => added.params.find((ap) => ap.cell === x.cell)?.value !== x.value);
      // Customized specs from the product page travel with the line.
      const patch = {
        ...(changed.length ? { params: changed } : {}),
        ...(custom && custom.L !== added.L ? { L: custom.L } : {}),
        ...(custom && custom.H !== added.H ? { H: custom.H } : {}),
        ...(custom && custom.description.trim() && custom.description !== added.description ? { description: custom.description } : {}),
        ...(custom?.lotto !== undefined && custom.lotto !== (added.lotto ?? '') ? { lotto: custom.lotto || null } : {}),
        ...(custom?.notes ? { notes: custom.notes } : {}),
      };
      if (Object.keys(patch).length) p = await api.updateItem(p.id, added.id, patch);
      onQuotation(p);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      void api.quotation(quotationId).then(onQuotation).catch(() => undefined);
      return false;
    }
  };

  /** The selected draft quotation is the current working quotation. */
  const drafts = quotations.filter((q) => q.status === 'draft').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const cart = drafts.find((q) => q.id === cartId) ?? drafts[0] ?? null;
  const [workspaceTab, setWorkspaceTab] = useState('elenco');
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

  // Shared insight links are public, read-only reports: no sign-in needed.
  if (route.page === 'shared') return <SharedInsight id={route.id} />;
  if (user === undefined) return <main className="login muted">Checking session…</main>;
  if (!user) return <Login onLogin={setUser} />;

  const current = route.page === 'quotation' || route.page === 'new' ? (quotations.find((p) => p.id === route.id) ?? null) : null;
  const navItem = (page: 'dashboard' | 'catalog' | 'quotations' | 'contacts' | 'projects' | 'customers' | 'materials' | 'import', label: string, icon: IconName, active: boolean): ReactElement => (
    <button className={`nav-item ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined} onClick={() => navigate(page === 'quotations' ? { page: 'quotations', status: 'all' } : { page })}>
      <Icon name={icon} /> <span>{label}</span>
    </button>
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand brand-qc">
          <img src="/quo-captain.svg" alt="" className="brand-qc-mark" />
          <div>
            <span className="brand-qc-name">Quo-Captain</span>
            <span className="brand-qc-by">by <img src="/somec-logo.svg" alt="Somec Group" /></span>
          </div>
        </div>
        <div className="nav-caption">Workspace</div>
        <nav aria-label="Main navigation">
          {navItem('dashboard', 'Dashboard', 'dashboard', route.page === 'dashboard')}
          {navItem('projects', 'Projects', 'projects', route.page === 'projects')}
          {navItem('customers', 'Customers', 'customers', route.page === 'customers')}
          {navItem('catalog', 'Catalog', 'catalog', route.page === 'catalog' || route.page === 'product')}
          {navItem('materials', 'Materials', 'materials', route.page === 'materials')}
          {navItem('quotations', 'Quotations', 'quotations', route.page === 'quotations' || route.page === 'quotation' || route.page === 'new')}
          {navItem('contacts', 'Contacts', 'contacts', route.page === 'contacts')}
          {navItem('import', 'Import', 'upload', route.page === 'import')}
        </nav>
        <div className="sidebar-foot">
          <div className="sidebar-account"><span className="sidebar-user-avatar">{user.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span><span className="sidebar-user-copy"><strong>{user.name}</strong><small>{user.role === 'admin' ? 'Administrator' : 'Salesperson'}</small></span></div>
          <div className="sidebar-prefs">
            <button className="sidebar-signout" aria-pressed={theme === 'dark'} onClick={() => { const next = theme === 'dark' ? 'light' : 'dark'; setTheme(next); setThemeState(next); }}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} /> Dark mode</button>
            <button className="sidebar-signout" aria-pressed={textSize === 'large'} onClick={() => { const next = textSize === 'large' ? 'normal' : 'large'; setTextSize(next); setTextSizeState(next); }}><Icon name="text" size={17} /> Large text</button>
          </div>
          <button className="sidebar-signout" onClick={logout}><Icon name="signout" size={17} /> Sign out</button>
        </div>
      </aside>
      <main className="content">
        <ProjectFinder />
        {error && (
          <div className="error-box" style={{ marginBottom: 12 }}>
            {error}{' '}
            <button onClick={() => setError(null)} style={{ padding: '0 6px' }}>
              ×
            </button>
          </div>
        )}
        {route.page === 'dashboard' && <DashboardPage initialCustomerId={route.customerId} />}
        {route.page === 'catalog' && <ProductHome facets={facets} quotations={quotations} estimator={user.name} initialQuery={route.q} initialCreate={route.create} onError={setError} onAddToQuotation={(r, id) => addTo(id, r, 1, [])} />}
        {route.page === 'product' && <ProductPage id={route.id} quotations={quotations} facets={facets} estimator={user.name} onAddToQuotation={(r, id, quantity, custom) => addTo(id, r, quantity, custom?.params ?? [], custom)} onError={setError} />}
        {route.page === 'contacts' && <ContactsPage quotations={quotations} />}
        {route.page === 'insights' && <InsightsPage initial={route.q} onCreated={() => void loadQuotations()} />}
        {route.page === 'import' && <ImportPage onImported={async (quotationId) => { await loadQuotations(); setCartId(quotationId); navigate({ page: 'quotations' }); }} />}
        {route.page === 'projects' && <ProjectsPage projectId={route.id} estimator={user.name} onError={setError} onUpdated={() => void loadQuotations()} onQuotationCreated={(q) => { onQuotation(q); setCartId(q.id); navigate({ page: 'quotations' }); }} />}
        {route.page === 'customers' && <CustomersPage customerId={route.id} onError={setError} />}
        {route.page === 'materials' && <MaterialsPage materialId={route.id} onError={setError} />}
        {route.page === 'quotations' && !route.status && (
          <CartWorkspace drafts={drafts} current={cart} facets={facets} estimator={user.name} onError={setError} onSelect={setCartId} onDelete={(q) => void deleteQuotation(q)} onCreated={(q) => { onQuotation(q); setCartId(q.id); }}>
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
            }} facets={facets} tab={route.tab} onQuotation={onQuotation} onError={setError} /> : <section className="panel muted">{quotations.length ? 'Quotation not found.' : 'Loading…'}</section>)}
        {route.page === 'new' && <NewQuotation facets={facets} quotation={current} step={route.step} onQuotation={onQuotation} onAdd={async (r, q, prm) => { if (current) await addTo(current.id, r, q, prm); }} onError={setError} />}
      </main>
      <WorkspaceAssistant quotations={quotations} facets={facets} onError={setError} />
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
            View quotation →
          </button>
        </div>
      )}
    </div>
  );
}
