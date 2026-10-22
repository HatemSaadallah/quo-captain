import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, fmtMoney } from '../api';
import { navigate } from '../route';
import { CONTACTS } from './ContactsPage';
import { InsightChart, type ChartData } from './InsightChart';
import '../insights.css';

type Action = { type: 'project' | 'quotation'; id: string; label: string };
type Message = { role: 'user' | 'assistant'; content: string; error?: boolean; queries?: string[]; data?: ChartData | null; cached?: boolean; actions?: Action[]; file?: string };
type Tab = { id: number; title: string; messages: Message[] };

const STORE = 'somec.insights.tabs';
/** Starter questions: each maps to one tool call, so answers stay fast and cheap. */
const PROMPTS: Array<{ topic: string; text: string }> = [
  { topic: 'Customers', text: 'Which customer brings the most estimated cost this year, and which product category drives it?' },
  { topic: 'Trend', text: 'How has our quoted cost moved month by month over the last 12 months?' },
  { topic: 'Pricing', text: 'What is the cheapest windscreen per m² we have costed, and where does it come from?' },
  { topic: 'Comparison', text: 'Compare the typical historical unit cost of balustrades, dividers and sliding doors.' },
  { topic: 'Pipeline', text: 'Which draft quotations are the largest, and what is in them?' },
  { topic: 'Distribution', text: 'Show a histogram of windscreen unit costs per m².' },
  { topic: 'Share', text: 'Pie chart of estimated cost by product type for confirmed quotations.' },
  { topic: 'People', text: 'Which installers specialise in flooring?' },
];
/** Only the recent turns go to the model; older ones are kept on screen but cost nothing. */
const HISTORY = 8;

const load = (): Tab[] => {
  try {
    const raw = localStorage.getItem(STORE);
    const tabs = raw ? (JSON.parse(raw) as Tab[]) : [];
    return tabs.length ? tabs : [{ id: 1, title: 'New analysis', messages: [] }];
  } catch {
    return [{ id: 1, title: 'New analysis', messages: [] }];
  }
};

/** Minimal renderer for the assistant's markdown: headings, bold, bullets and tables. */
function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>));
}
export function Markdown({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const out: ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      i--;
      const [head, ...body] = rows;
      out.push(
        <div className="in-table" key={`t${i}`}>
          <table>
            <thead>
              <tr>{head?.map((c, k) => <th key={k}>{inline(c)}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((r, k) => (
                <tr key={k}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else if (/^[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) items.push(lines[i++].trim().replace(/^[-*•]\s+/, ''));
      i--;
      out.push(
        <ul key={`u${i}`}>
          {items.map((it, k) => <li key={k}>{inline(it)}</li>)}
        </ul>,
      );
    } else if (/^#{1,4}\s/.test(line)) out.push(<h3 key={`h${i}`}>{inline(line.replace(/^#+\s/, ''))}</h3>);
    else out.push(<p key={`p${i}`}>{inline(line)}</p>);
  }
  return <>{out}</>;
}

export function InsightsPage({ initial, onCreated }: { initial?: string; onCreated?: () => void }) {
  const [tabs, setTabs] = useState<Tab[]>(load);
  const [activeId, setActiveId] = useState<number>(() => load()[0].id);
  const [draft, setDraft] = useState('');
  const [busyTab, setBusyTab] = useState<number | null>(null);
  const [attached, setAttached] = useState<{ name: string; text: string } | null>(null);
  const [shared, setShared] = useState<Record<string, string>>({});

  /** Freeze an answer as a read-only snapshot and copy its link. */
  const share = async (key: string, question: string, m: Message): Promise<void> => {
    try {
      const { id } = await api.shareInsight({ question, answer: m.content, queries: m.queries ?? [], chart: m.data ?? null });
      const link = `${window.location.origin}${window.location.pathname}#/shared/insight/${id}`;
      setShared((cur) => ({ ...cur, [key]: link }));
      await navigator.clipboard?.writeText(link).catch(() => undefined);
    } catch (e) {
      setShared((cur) => ({ ...cur, [key]: `error:${e instanceof Error ? e.message : String(e)}` }));
    }
  };
  const fileInput = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const handled = useRef<string | null>(null);
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(tabs.slice(-12)));
    } catch {
      // per-browser convenience only
    }
  }, [tabs]);

  useEffect(() => {
    // Block body on purpose: Chrome's scrollIntoView now returns a promise, and an effect must not return one.
    endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [active?.messages.length, busyTab]);

  const newTab = (): number => {
    const id = Math.max(0, ...tabs.map((t) => t.id)) + 1;
    setTabs((cur) => [...cur, { id, title: 'New analysis', messages: [] }]);
    setActiveId(id);
    return id;
  };

  const closeTab = (id: number): void => {
    setTabs((cur) => {
      const next = cur.filter((t) => t.id !== id);
      if (!next.length) return [{ id: id + 1, title: 'New analysis', messages: [] }];
      return next;
    });
    if (id === activeId) {
      const rest = tabs.filter((t) => t.id !== id);
      setActiveId(rest.length ? rest[rest.length - 1].id : id + 1);
    }
  };

  const ask = async (text: string, tabId = activeId): Promise<void> => {
    const question = text.trim();
    if (!question || busyTab !== null) return;
    const before = tabs.find((t) => t.id === tabId)?.messages ?? [];
    const file = attached;
    setAttached(null);
    const thread: Message[] = [...before, { role: 'user' as const, content: file ? `${question}\n\n[Attached file: ${file.name}]\n${file.text}` : question, file: file?.name }];
    setTabs((cur) => cur.map((t) => (t.id === tabId ? { ...t, messages: thread, title: t.messages.length ? t.title : question.slice(0, 40) } : t)));
    setDraft('');
    setBusyTab(tabId);
    try {
      const send = thread.filter((m) => !m.error).slice(-HISTORY).map(({ role, content }) => ({ role, content }));
      const { reply, queries, data, cached, actions } = await api.assistantChat(send, CONTACTS);
      if (actions?.length) onCreated?.();
      setTabs((cur) => cur.map((t) => (t.id === tabId ? { ...t, messages: [...thread, { role: 'assistant', content: reply, queries, data, cached, actions }] } : t)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTabs((cur) => cur.map((t) => (t.id === tabId ? { ...t, messages: [...thread, { role: 'assistant', content: `${msg} Try again in a minute, or ask a narrower question.`, error: true }] } : t)));
    } finally {
      setBusyTab(null);
    }
  };

  // A question handed over from the global search opens in its own tab, once.
  useEffect(() => {
    if (!initial || handled.current === initial) return;
    handled.current = initial;
    const id = newTab();
    window.setTimeout(() => void ask(initial, id), 0);
    navigate({ page: 'insights' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  /** Attach a file: Analisi workbooks are imported; text files go to the assistant as context. */
  const onFile = async (f: File | undefined): Promise<void> => {
    if (!f) return;
    const tabId = active?.id ?? activeId;
    const say = (content: string, extra: Partial<Message> = {}): void =>
      setTabs((cur) => cur.map((t) => (t.id === tabId ? { ...t, messages: [...t.messages, { role: 'user', content: `Attached ${f.name}`, file: f.name }, { role: 'assistant', content, ...extra }] } : t)));
    if (/\.xlsx$/i.test(f.name)) {
      setBusyTab(tabId);
      try {
        const r = await api.importWorkbook(f);
        onCreated?.();
        say(`**${r.reference} imported** from ${f.name}: ${r.lines} lines (${r.linkedToCatalog} linked to historical analyses), estimated cost ${fmtMoney(r.totalEstimatedCost)}, customer ${r.customer}. Ask me about it or open the draft.`, { actions: [{ type: 'quotation', id: r.quotationId, label: `Open draft ${r.reference}` }] });
      } catch (e) {
        say(`${e instanceof Error ? e.message : String(e)}`, { error: true });
      } finally {
        setBusyTab(null);
      }
    } else if (/\.(txt|csv|md|json|tsv)$/i.test(f.name) || f.type.startsWith('text/')) {
      const text = (await f.text()).slice(0, 6000); // keep the prompt small
      setAttached({ name: f.name, text });
    } else {
      say(`I can't read ${f.name} yet. Attach an Analisi workbook (.xlsx) to import it, or a text/CSV file to use as context.`, { error: true });
    }
  };

  const busy = busyTab === active?.id;

  return (
    <div className="in-page">
      <header className="in-head">
        <div>
          <h1>Insights</h1>
          <p>Ask about customers, quotations, products and costs in plain language. Answers are built from your workspace data.</p>
        </div>
      </header>

      <div className="in-tabs" role="tablist" aria-label="Analyses">
        {tabs.map((t) => (
          <div key={t.id} className={`in-tab ${t.id === active?.id ? 'on' : ''}`}>
            <button role="tab" aria-selected={t.id === active?.id} onClick={() => setActiveId(t.id)} title={t.title}>
              {busyTab === t.id && <span className="in-dot" aria-hidden="true" />}
              {t.title}
            </button>
            <button className="in-tab-close" aria-label={`Close ${t.title}`} onClick={() => closeTab(t.id)}>
              ×
            </button>
          </div>
        ))}
        <button className="in-tab-new" onClick={() => newTab()} aria-label="New analysis tab">
          ＋ New analysis
        </button>
      </div>

      <section className="in-thread" aria-live="polite">
        {active && active.messages.length === 0 && (
          <div className="in-start">
            <h2>What would you like to know?</h2>
            <div className="in-prompts">
              {PROMPTS.map((p) => (
                <button key={p.text} onClick={() => void ask(p.text)} disabled={busyTab !== null}>
                  <span className="in-topic">{p.topic}</span>
                  {p.text}
                </button>
              ))}
            </div>
          </div>
        )}
        {active?.messages.map((m, i) => (
          <div key={i} className={`in-msg ${m.role} ${m.error ? 'error' : ''}`}>
            {m.role === 'assistant' ? <Markdown text={m.content} /> : <p>{m.file ? m.content.split('\n\n[Attached file:')[0] : m.content}</p>}
            {m.file && m.role === 'user' && <span className="in-file">📎 {m.file}</span>}
            {m.role === 'assistant' && !m.error && (
              <div className="in-share">
                {shared[`${active?.id}-${i}`] && !shared[`${active?.id}-${i}`].startsWith('error:') ? (
                  <>
                    <span className="in-share-ok">✓ Link copied</span>
                    <a href={shared[`${active?.id}-${i}`]} target="_blank" rel="noreferrer">
                      Open shared report
                    </a>
                  </>
                ) : (
                  <button
                    className="in-share-btn"
                    onClick={() => {
                      const q = [...(active?.messages.slice(0, i) ?? [])].reverse().find((x) => x.role === 'user');
                      void share(`${active?.id}-${i}`, q ? q.content.split('\n\n[Attached file:')[0] : '', m);
                    }}
                  >
                    Share or export
                  </button>
                )}
              </div>
            )}
            {m.actions && m.actions.length > 0 && (
              <div className="in-actions">
                {m.actions.map((a) => (
                  <button key={a.id} className="primary" onClick={() => navigate(a.type === 'quotation' ? { page: 'quotation', id: a.id, tab: 'elenco' } : { page: 'projects', id: a.id })}>
                    {a.label}
                  </button>
                ))}
              </div>
            )}
            {m.data && <InsightChart data={m.data} />}
            {m.queries && m.queries.length > 0 && (
              <details className="in-queries">
                <summary>
                  Based on {m.queries.length} {m.queries.length === 1 ? 'query' : 'queries'}
                  {m.cached ? ' · instant (cached)' : ''}
                </summary>
                {m.queries.map((q, k) => (
                  <code key={k}>{q}</code>
                ))}
              </details>
            )}
          </div>
        ))}
        {busy && (
          <div className="in-msg assistant in-thinking">
            <span />
            <span />
            <span />
            Analysing your data…
          </div>
        )}
        <div ref={endRef} />
      </section>

      <form
        className="in-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(draft);
        }}
      >
        <input ref={fileInput} type="file" hidden accept=".xlsx,.csv,.txt,.md,.json,.tsv,.pdf,image/*" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
        <button type="button" className="in-attach" onClick={() => fileInput.current?.click()} aria-label="Attach a file" title="Attach a file (Analisi .xlsx to import, or text/CSV as context)">
          📎
        </button>
        {attached && (
          <span className="in-attached">
            {attached.name}
            <button type="button" aria-label="Remove attachment" onClick={() => setAttached(null)}>
              ×
            </button>
          </span>
        )}
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void ask(draft);
            }
          }}
          rows={2}
          placeholder="e.g. Which balcony products got more expensive between 2025 and 2026?"
          aria-label="Ask a question"
        />
        <button className="primary" type="submit" disabled={!draft.trim() || busyTab !== null}>
          {busyTab !== null ? 'Working…' : 'Ask'}
        </button>
      </form>
      <p className="in-foot">Costs are estimates from historical analyses, not selling prices. Each tab keeps its own conversation.</p>
    </div>
  );
}
