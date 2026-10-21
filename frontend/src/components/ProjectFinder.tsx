import { useState, useRef } from 'react';
import { api, type Project } from '../api';
import { navigate } from '../route';
import '../projects.css';

export function ProjectFinder({ projects, onQuery, onMatches }: { projects?: Project[]; onQuery?: (query: string) => void; onMatches?: (ids: string[] | null) => void }) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'llm' | 'preview'>('llm');
  const [reply, setReply] = useState('');
  const [matches, setMatches] = useState<Project[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const reset = (value: string): void => { requestId.current++; setQuery(value); setReply(''); setMatches(null); setError(''); setBusy(false); onQuery?.(value); onMatches?.(null); };
  const search = async (): Promise<void> => {
    if (!query.trim() || busy) return;
    const current = ++requestId.current;
    setBusy(true); setError(''); setReply(''); setMatches(null);
    try {
      const [result, all] = await Promise.all([api.searchProjects(query.trim()), projects ? Promise.resolve(projects) : api.projects()]);
      if (requestId.current !== current) return;
      setMode(result.mode ?? 'llm'); setReply(result.reply); setMatches(result.projectIds.flatMap((id) => all.filter((project) => project.id === id))); onMatches?.(result.projectIds);
    } catch (reason) { if (requestId.current === current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (requestId.current === current) setBusy(false); }
  };
  return <div className={`project-finder ${onMatches ? 'embedded' : ''}`}>
    <form className="project-find-form" role="search" onSubmit={(event) => { event.preventDefault(); void search(); }}>
      <span className="finder-icon" aria-hidden="true">⌕</span><input aria-label={onMatches ? 'Search projects' : 'Find a project with natural language'} placeholder={onMatches ? 'Search projects, customers or references…' : 'Find a project… “the last balcony project for APEXA”'} value={query} onChange={(event) => reset(event.target.value)} />
      {query && <button type="button" className="finder-clear" aria-label="Clear project search" onClick={() => reset('')}>×</button>}
      <button className="finder-ask" disabled={busy || !query.trim()}>{busy ? 'Finding…' : '✦ Ask Somec'}</button>
      {!onMatches && <button type="button" className="finder-catalog" onClick={() => navigate({ page: 'catalog', q: query.trim() || undefined })}>Catalog ↗</button>}
    </form>
    {busy && <div className="finder-feedback" role="status">Looking through your projects and quotation details…</div>}
    {error && <div className="finder-feedback finder-error" role="alert">{error}{onMatches && <span> You can still filter by project name, customer or reference.</span>}</div>}
    {matches && <div className="finder-feedback" role="status"><span className="finder-spark" aria-hidden="true">✦</span><div>{mode === 'preview' && <span className="project-preview-label">Preview mode · LLM unavailable, using project records</span>}{reply}<span className="small muted">{matches.length} matching {matches.length === 1 ? 'project' : 'projects'}</span></div>{onMatches && <button type="button" onClick={() => reset('')}>Show all</button>}</div>}
    {!onMatches && matches && <div className="finder-results">{matches.map((project) => <button key={project.id} onClick={() => { reset(''); navigate({ page: 'projects', id: project.id }); }}><span><strong>{project.name}</strong><small>{project.customer} · {project.quotations.length} quotations</small></span><span aria-hidden="true">→</span></button>)}</div>}
  </div>;
}
