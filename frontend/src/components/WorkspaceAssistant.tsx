import { useState } from 'react';
import { api, type CatalogFacets, type CatalogRecord, type Quotation } from '../api';
import { cleanTitle } from '../product';
import { navigate } from '../route';
import { CONTACTS } from './ContactsPage';

/** Local semantic catalog search with explicit, reviewable catalog actions. */
export function WorkspaceAssistant({ quotations, facets, onError }: { quotations: Quotation[]; facets: CatalogFacets | null; onError: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<CatalogRecord[]>([]);
  const [quoteMatches, setQuoteMatches] = useState<Quotation[]>([]);
  const [contactMatches, setContactMatches] = useState<typeof CONTACTS>([]);
  const [workbookMatches, setWorkbookMatches] = useState<CatalogFacets['workbooks']>([]);
  const [fileMatches, setFileMatches] = useState<Array<{ folder: string; file: string }>>([]);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const ask = async (): Promise<void> => {
    if (!query.trim()) return;
    const next = [...messages, { role: 'user' as const, content: query.trim() }];
    setMessages(next);
    const submitted = query.trim();
    setQuery('');
    setBusy(true);
    try {
      const terms = submitted.toLocaleLowerCase().split(/\s+/).filter((word) => word.length > 2);
      const quotes = quotations.map((q) => ({ q, text: [q.name, q.customer, q.reference, q.estimator, ...q.items.map((i) => `${i.description} ${i.itemCode} ${i.unit}`)].join(' ').toLocaleLowerCase() }))
        .map(({ q, text }) => ({ q, score: terms.filter((term) => text.includes(term)).length }))
        .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 5).map((x) => x.q);
      const contacts = CONTACTS.map((c) => ({ c, text: Object.values(c).flatMap((v) => Array.isArray(v) ? v : [v]).join(' ').toLocaleLowerCase() }))
        .map(({ c, text }) => ({ c, score: terms.filter((term) => text.includes(term)).length })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 5).map((x) => x.c);
      const workbooks = (facets?.workbooks ?? []).map((w) => ({ w, text: Object.values(w).join(' ').toLocaleLowerCase() }))
        .map(({ w, text }) => ({ w, score: terms.filter((term) => text.includes(term)).length })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 5).map((x) => x.w);
      const files = await api.outputs().catch(() => []);
      const outputs = files.filter((f) => terms.some((term) => `${f.folder} ${f.file}`.toLocaleLowerCase().includes(term))).slice(0, 5);
      const products = (await api.search(submitted, { limit: 8 }).catch(() => ({ hits: [] }))).hits.map((h) => h.record);
      setQuoteMatches(quotes);
      setContactMatches(contacts);
      setWorkbookMatches(workbooks);
      setFileMatches(outputs);
      setAnswer(products);
      const response = await api.assistantChat(next, CONTACTS);
      setMessages([...next, { role: 'assistant', content: response.reply }]);
    }
    catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      onError(message);
      setMessages([...next, { role: 'assistant', content: `I could not complete that request: ${message}` }]);
    }
    finally { setBusy(false); }
  };
  return <>
    <button className="assistant-launch" onClick={() => setOpen(!open)} aria-expanded={open}>✦ Ask Somec</button>
    {open && <aside className="assistant-panel" aria-label="Somec assistant">
      <header><div><b>Somec assistant</b><div className="small muted">Search across your workspace</div></div><button onClick={() => setOpen(false)} aria-label="Close">×</button></header>
      <div className="assistant-messages"><p className="assistant-note">Ask about products, quotations, customers, contacts, workbooks or generated files.</p>
        {messages.map((m, index) => <div className={`assistant-bubble ${m.role}`} key={`${m.role}-${index}`}><b>{m.role === 'user' ? 'You' : 'Somec'}</b><div>{m.content}</div></div>)}
        {quoteMatches.length > 0 && <div><b className="small">Quotations</b>{quoteMatches.map((q) => <button className="assistant-result" key={q.id} onClick={() => { setOpen(false); navigate({ page: 'quotation', id: q.id, tab: 'elenco' }); }}>{q.name}<small>{q.reference} · {q.customer} · {q.items.length} rows</small></button>)}</div>}
        {contactMatches.length > 0 && <div><b className="small">Contacts</b>{contactMatches.map((c) => <button className="assistant-result" key={c.email} onClick={() => { setOpen(false); navigate({ page: 'contacts' }); }}>{c.name}<small>{c.role} · {c.company} · {c.email}</small></button>)}</div>}
        {workbookMatches.length > 0 && <div><b className="small">Workbooks</b>{workbookMatches.map((w) => <button className="assistant-result" key={w.workbook} onClick={() => { setOpen(false); navigate({ page: 'catalog', q: w.workbook }); }}>{w.workbook}<small>{w.projectName} · {w.client}</small></button>)}</div>}
        {fileMatches.length > 0 && <div><b className="small">Generated files</b>{fileMatches.map((f) => <button className="assistant-result" key={`${f.folder}/${f.file}`} onClick={() => { void api.download(`${f.folder}/${f.file}`).catch((e) => onError(String(e))); }}>{f.file}<small>{f.folder}</small></button>)}</div>}
        {answer.length > 0 && <div><b className="small">Catalog products</b>{answer.map((r) => <button className="assistant-result" key={r.id} onClick={() => { setOpen(false); navigate({ page: 'product', id: r.id }); }}>{cleanTitle(r)}<small>{r.custom ? 'Custom catalog' : `${r.workbook} · ${r.sheet ?? ''}`}</small></button>)}</div>}
        {answer.length === 0 && quoteMatches.length === 0 && contactMatches.length === 0 && workbookMatches.length === 0 && fileMatches.length === 0 && <p className="small muted">No matching records found.</p>}
        <div className="assistant-actions"><button className="assistant-create" onClick={() => { setOpen(false); navigate({ page: 'catalog', create: true }); }}>＋ Create product</button><button className="assistant-create" onClick={() => { setOpen(false); navigate({ page: 'quotations' }); }}>＋ Create quotation</button></div>
      </div>
      <form className="assistant-input" onSubmit={(e) => { e.preventDefault(); void ask(); }}><textarea rows={2} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. balcony glass panel, 2.5 m wide" /><button className="primary" disabled={busy || !query.trim()}>{busy ? 'Searching…' : 'Search'}</button></form>
      <button className="assistant-create-link" onClick={() => { setOpen(false); navigate({ page: 'quotations' }); }}>Open workspace</button>
    </aside>}
  </>;
}
