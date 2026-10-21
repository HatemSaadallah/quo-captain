import { useCallback, useEffect, useState } from 'react';
import { api, type CatalogFacets, type CatalogRecord, type Project } from './api';
import { Cart } from './components/Cart';
import { ProductSearch } from './components/ProductSearch';
import { ProjectSetup } from './components/ProjectSetup';

export default function App() {
  const [facets, setFacets] = useState<CatalogFacets | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [current, setCurrent] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async (): Promise<void> => {
    try {
      setProjects(await api.projects());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    api.facets().then(setFacets).catch((e: unknown) => setError(`Backend not reachable: ${e instanceof Error ? e.message : String(e)}`));
    void loadProjects();
  }, [loadProjects]);

  const onAdd = async (record: CatalogRecord, quantity: number, params: Array<{ cell: string; value: number | string | null }>): Promise<void> => {
    if (!current) return;
    try {
      let p = await api.addItem(current.id, { catalogId: record.id, quantity });
      const added = p.items[p.items.length - 1];
      const changed = params.filter((x) => added.params.find((ap) => ap.cell === x.cell)?.value !== x.value);
      if (changed.length) p = await api.updateItem(p.id, added.id, { params: changed });
      setCurrent(p);
      void loadProjects();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onProject = (p: Project): void => {
    setCurrent(p);
    void loadProjects();
  };

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
      </header>
      <main className="layout">
        <div className="stack">
          <ProjectSetup facets={facets} projects={projects} current={current} onSelect={setCurrent} onChanged={() => void loadProjects()} onError={setError} />
          <ProductSearch facets={facets} canAdd={!!current} onAdd={onAdd} onError={setError} />
        </div>
        <div className="stack">
          {current ? (
            <Cart project={current} onProject={onProject} onError={setError} />
          ) : (
            <section className="panel muted">Create or select a project to start a cart.</section>
          )}
        </div>
      </main>
    </>
  );
}
