import { useState, useRef } from 'react';
import { api, fmtMoney, type CatalogRecord, type Project } from '../api';
import { cleanTitle, isProduct, productCost } from '../product';
import { navigate } from '../route';
import { Icon } from './Icon';
import '../projects.css';

export function ProjectFinder({ projects, onQuery, onMatches }: { projects?: Project[]; onQuery?: (query: string) => void; onMatches?: (ids: string[] | null) => void }) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'llm' | 'preview'>('llm');
  const [reply, setReply] = useState('');
  const [matches, setMatches] = useState<Project[] | null>(null);
  const [products, setProducts] = useState<CatalogRecord[]>([]);
  const [known, setKnown] = useState<Project[] | null>(projects ?? null);
  const loadKnown = (): void => { if (!known) void api.projects().then(setKnown).catch(() => undefined); };
  const q = query.trim().toLowerCase();
  // Instant matches while typing: project name, customer or a quotation reference.
  const instant = q.length >= 2 && !matches ? (known ?? []).filter((p) => q.split(/\s+/).every((w) => `${p.name} ${p.customer} ${p.quotations.map((x) => x.reference).join(' ')}`.toLowerCase().includes(w))).slice(0, 5) : [];
  const wantsCreate = /\b(create|new|make|start|build|set up|prepare|draft)\b/i.test(query) && /\b(quot\w*|offer|project|draft)\b/i.test(query);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const reset = (value: string): void => { requestId.current++; setQuery(value); setReply(''); setMatches(null); setProducts([]); setError(''); setBusy(false); onQuery?.(value); onMatches?.(null); };
  const search = async (): Promise<void> => {
    if (!query.trim() || busy) return;
    const current = ++requestId.current;
    setBusy(true); setError(''); setReply(''); setMatches(null);
    try {
      // Global search: projects through the LLM, products through the semantic catalog index, in parallel.
      const [result, all, catalog] = await Promise.all([api.searchProjects(query.trim()), projects ? Promise.resolve(projects) : api.projects(), onMatches ? Promise.resolve(null) : api.search(query.trim(), { limit: 12 }).catch(() => null)]);
      if (requestId.current !== current) return;
      setProducts((catalog?.hits ?? []).map((h) => h.record).filter((r) => r.sheet && isProduct(r)).slice(0, 4));
      setMode(result.mode ?? 'llm'); setReply(result.reply); setMatches(result.projectIds.flatMap((id) => all.filter((project) => project.id === id))); onMatches?.(result.projectIds);
    } catch (reason) { if (requestId.current === current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (requestId.current === current) setBusy(false); }
  };
  return <div className={`project-finder ${onMatches ? 'embedded' : ''}`}>
    <form className="project-find-form" role="search" onSubmit={(event) => { event.preventDefault(); void search(); }}>
      <span className="finder-icon"><Icon name="search" size={19} /></span><input onFocus={loadKnown} aria-label={onMatches ? 'Search projects' : 'Search everything in plain language'} placeholder={onMatches ? 'Search projects, customers or references…' : 'Search in plain language: “last balcony project for APEXA”, “teak flooring”…'} value={query} onChange={(event) => reset(event.target.value)} />
      {query && <button type="button" className="finder-clear" aria-label="Clear project search" onClick={() => reset('')}>×</button>}
      <button className="finder-ask" disabled={busy || !query.trim()}>{busy ? 'Searching…' : 'Search'}</button>
      {!onMatches && <button type="button" className="finder-insights" onClick={() => navigate({ page: 'insights' })} title="Ask for insights and analysis in plain language">✦ Insights</button>}
    </form>
    {busy && <div className="finder-feedback" role="status">Looking through your projects and quotation details…</div>}
    {error && <div className="finder-feedback finder-error" role="alert">{error}{onMatches && <span> You can still filter by project name, customer or reference.</span>}</div>}
    {matches && <div className="finder-feedback" role="status"><span className="finder-spark" aria-hidden="true">✦</span><div>{mode === 'preview' && <span className="project-preview-label">Preview mode · LLM unavailable, using project records</span>}{reply}<span className="small muted">{matches.length} matching {matches.length === 1 ? 'project' : 'projects'}</span></div>{onMatches && <button type="button" onClick={() => reset('')}>Show all</button>}</div>}
    {!onMatches && !matches && (wantsCreate || instant.length > 0) && <div className="finder-results">
      {wantsCreate && <button className="finder-ask-row finder-create-row" onClick={() => { const text = query.trim(); reset(''); navigate({ page: 'insights', q: text }); }}><span><strong>✦ Create it with the assistant</strong><small>A guided conversation: customer, project and products, then a draft quotation you can open</small></span><span aria-hidden="true">→</span></button>}
      {instant.length > 0 && <div className="finder-group">Projects</div>}
      {instant.map((project) => <button key={project.id} onClick={() => { reset(''); navigate({ page: 'projects', id: project.id }); }}><span><strong>{project.name}</strong><small>{project.customer} · {project.quotations.length} quotations</small></span><span aria-hidden="true">→</span></button>)}
    </div>}
    {!onMatches && (matches || products.length > 0) && <div className="finder-results">
      {wantsCreate && <button className="finder-ask-row finder-create-row" onClick={() => { const text = query.trim(); reset(''); navigate({ page: 'insights', q: text }); }}><span><strong>✦ Create it with the assistant</strong><small>Continue in a guided conversation</small></span><span aria-hidden="true">→</span></button>}
      <button className="finder-ask-row" onClick={() => { const q = query.trim(); reset(''); navigate({ page: 'insights', q }); }}><span><strong>✦ Ask Insights</strong><small>Analyse “{query.trim()}” across quotations, customers and costs</small></span><span aria-hidden="true">→</span></button>
      {products.length > 0 && <div className="finder-group">Products</div>}
      {products.map((r) => <button key={r.id} onClick={() => { reset(''); navigate({ page: 'product', id: r.id }); }}><span><strong>{cleanTitle(r)}</strong><small>{r.categoryName ?? 'Product'} · {fmtMoney(productCost(r))} / {r.unit ?? 'unit'}</small></span><span aria-hidden="true">→</span></button>)}
      {matches && matches.length > 0 && <div className="finder-group">Projects</div>}
    </div>}
    {!onMatches && matches && <div className="finder-results finder-results-projects">{matches.map((project) => <button key={project.id} onClick={() => { reset(''); navigate({ page: 'projects', id: project.id }); }}><span><strong>{project.name}</strong><small>{project.customer} · {project.quotations.length} quotations</small></span><span aria-hidden="true">→</span></button>)}</div>}
  </div>;
}
