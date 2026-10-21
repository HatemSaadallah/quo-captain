import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  getToken,
  onUnauthorized,
  type AuthUser,
  type CatalogFacets,
  type CatalogRecord,
  type Project,
} from './api';
import { Cart } from './components/Cart';
import { ElencoCosti } from './components/ElencoCosti';
import { Login } from './components/Login';
import { ProductSearch } from './components/ProductSearch';
import { ProjectSetup } from './components/ProjectSetup';

export default function App() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined); // undefined = checking stored token
  const [facets, setFacets] = useState<CatalogFacets | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [current, setCurrent] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'elenco' | 'cart'>('elenco');
  const currentId = useRef(current?.id);
  currentId.current = current?.id;

  useEffect(() => {
    onUnauthorized(() => {
      setUser(null);
      setCurrent(null);
      setProjects([]);
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

  const loadProjects = useCallback(async (): Promise<void> => {
    try {
      setProjects(await api.projects());
      setProjectsLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    api
      .facets()
      .then(setFacets)
      .catch((e: unknown) => setError(`Backend not reachable: ${e instanceof Error ? e.message : String(e)}`));
    void loadProjects();
  }, [user, loadProjects]);

  const onAdd = async (
    record: CatalogRecord,
    quantity: number,
    params: Array<{ cell: string; value: number | string | null }>,
  ): Promise<void> => {
    if (!current) return;
    const projectId = current.id;
    let added = false;
    try {
      let p = await api.addItem(projectId, { catalogId: record.id, quantity });
      added = true;
      const newItem = p.items[p.items.length - 1];
      const changed = params.filter((x) => newItem.params.find((ap) => ap.cell === x.cell)?.value !== x.value);
      if (changed.length) p = await api.updateItem(p.id, newItem.id, { params: changed });
      if (currentId.current === projectId) setCurrent(p);
      void loadProjects();
    } catch (e) {
      if (added) {
        try {
          const persisted = await api.project(projectId);
          if (currentId.current === projectId) setCurrent(persisted);
        } catch {
          /* The error below still reports that customization failed. */
        }
        void loadProjects();
      }
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onProject = (p: Project): void => {
    if (currentId.current === p.id) setCurrent(p);
    void loadProjects();
  };

  const logout = (): void => {
    api.logout();
    setUser(null);
    setCurrent(null);
    setProjects([]);
    setFacets(null);
  };

  if (user === undefined) return <main className="login muted">Checking session…</main>;
  if (!user) return <Login onLogin={setUser} />;

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Somec · Quotation cost-analysis generator</h1>
          <div className="sub">
            {facets ? `${facets.recordCount} historical analyses from ${facets.workbooks.length} workbooks · embeddings ${facets.embeddings.status}` : 'loading catalog…'} · costs are estimated costs, not selling prices
          </div>
        </div>
        {error && (
          <div className="error-box" style={{ marginLeft: 'auto', maxWidth: 600 }}>
            {error}{' '}
            <button onClick={() => setError(null)} style={{ padding: '0 6px' }}>
              ×
            </button>
          </div>
        )}
        <div className="user" style={{ marginLeft: error ? 16 : 'auto' }}>
          <span className="small">
            {user.name} <span className="sub">({user.role})</span>
          </span>{' '}
          <button onClick={logout} style={{ padding: '2px 8px' }}>
            Sign out
          </button>
        </div>
      </header>
      <main className="layout">
        <div className="stack">
          <ProjectSetup facets={facets} projects={projects} projectsLoaded={projectsLoaded} current={current} onSelect={setCurrent} onChanged={() => void loadProjects()} onError={setError} />
          <ProductSearch facets={facets} canAdd={!!current} onAdd={onAdd} onError={setError} />
        </div>
        <div className="stack">
          {current ? (
            <>
              <div className="tabs" role="tablist">
                <button role="tab" aria-selected={view === 'elenco'} className={view === 'elenco' ? 'active' : ''} onClick={() => setView('elenco')}>
                  ELENCO COSTI (web)
                </button>
                <button role="tab" aria-selected={view === 'cart'} className={view === 'cart' ? 'active' : ''} onClick={() => setView('cart')}>
                  Cart & Excel export
                </button>
              </div>
              {view === 'elenco' ? <ElencoCosti project={current} onProject={onProject} onError={setError} /> : <Cart project={current} onProject={onProject} onError={setError} />}
            </>
          ) : (
            <section className="panel muted">Create or select a project to start its ELENCO COSTI.</section>
          )}
        </div>
      </main>
    </>
  );
}
