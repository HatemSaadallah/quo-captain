import { useState } from 'react';
import { api, type CatalogRecord } from '../api';
import { cleanTitle } from '../product';
import { navigate } from '../route';

/** Local semantic catalog search with explicit, reviewable catalog actions. */
export function CatalogAssistant({ onError }: { onError: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<CatalogRecord[]>([]);
  const ask = async (): Promise<void> => {
    if (!query.trim()) return;
    setBusy(true);
    try { setAnswer((await api.search(query, { limit: 8 })).hits.map((h) => h.record)); }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return <>
    <button className="assistant-launch" onClick={() => setOpen(!open)} aria-expanded={open}>✦ Ask catalog</button>
    {open && <aside className="assistant-panel" aria-label="Catalog assistant">
      <header><div><b>Catalog assistant</b><div className="small muted">Search products in plain language</div></div><button onClick={() => setOpen(false)} aria-label="Close">×</button></header>
      <div className="assistant-messages"><p className="assistant-note">Describe what you need. I’ll find matching catalog products using local semantic search.</p>
        {answer.length > 0 && <div><b className="small">Matches</b>{answer.map((r) => <button className="assistant-result" key={r.id} onClick={() => { setOpen(false); navigate({ page: 'product', id: r.id }); }}>{cleanTitle(r)}<small>{r.custom ? 'Custom catalog' : `${r.workbook} · ${r.sheet ?? ''}`}</small></button>)}</div>}
        {answer.length === 0 && <button className="assistant-create" onClick={() => { setOpen(false); navigate({ page: 'catalog', create: true }); }}>＋ Create a new catalog product</button>}
      </div>
      <form className="assistant-input" onSubmit={(e) => { e.preventDefault(); void ask(); }}><textarea rows={2} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. balcony glass panel, 2.5 m wide" /><button className="primary" disabled={busy || !query.trim()}>{busy ? 'Searching…' : 'Search'}</button></form>
      <button className="assistant-create-link" onClick={() => { setOpen(false); navigate({ page: 'catalog', create: true }); }}>Create product</button>
    </aside>}
  </>;
}
