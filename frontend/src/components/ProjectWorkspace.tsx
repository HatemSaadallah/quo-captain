import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, fmtMoney, type Project, type ProjectMessage, lineCost } from '../api';
import { navigate } from '../route';
import '../projects.css';
import { ProjectRequirements } from './ProjectRequirements';

export function ProjectWorkspace({ project, projects, onUpdated }: { project: Project; projects: Project[]; onUpdated: () => void }) {
  const [tab, setTab] = useState<'conversation' | 'brief' | 'requirements'>('conversation');
  const [messages, setMessages] = useState<ProjectMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [brief, setBrief] = useState(project.brief ?? '');
  const [savedBrief, setSavedBrief] = useState(project.brief ?? '');
  const [saved, setSaved] = useState(false);
  const [review, setReview] = useState<ProjectMessage | null>(null);
  const [draftName, setDraftName] = useState('');
  const [reference, setReference] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    api.projectMessages(project.id).then((result) => { if (live) setMessages(result); }).catch((reason: unknown) => { if (live) setError(reason instanceof Error ? reason.message : String(reason)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [project.id]);
  useEffect(() => { if (messages.length || pending) bottom.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }); }, [messages, pending]);
  const ask = async (event: FormEvent): Promise<void> => {
    event.preventDefault(); if (!query.trim() || busy) return;
    const submitted = query.trim(); setPending(submitted); setQuery(''); setBusy(true); setError('');
    try { setMessages(await api.projectChat(project.id, submitted)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setQuery(submitted); }
    finally { setPending(''); setBusy(false); }
  };
  const saveBrief = async (): Promise<void> => {
    setBusy(true); setError(''); setSaved(false);
    try { const result = await api.updateProjectBrief(project.id, brief); setBrief(result.brief); setSavedBrief(result.brief); setSaved(true); onUpdated(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  const createDraft = async (event: FormEvent): Promise<void> => {
    event.preventDefault(); if (!review || busy) return;
    setBusy(true); setError('');
    try { const result = await api.createProjectRevision(project.id, review.id, draftName.trim(), reference.trim()); setReview(null); onUpdated(); navigate({ page: 'quotation', id: result.quotationId, tab: 'elenco' }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  const allQuotations = projects.filter((item) => item.customerId === project.customerId).flatMap((item) => item.quotations);
  const source = review?.proposal ? allQuotations.find((quotation) => quotation.id === review.proposal?.sourceQuotationId) : null;
  const excluded = source?.items.filter((item) => review?.proposal?.excludeItemIds.includes(item.id)) ?? [];
  const kept = source?.items.filter((item) => !review?.proposal?.excludeItemIds.includes(item.id)) ?? [];
  return <section className="project-workspace">
    <header className="project-workspace-head"><div><span className="project-overline">Project workspace</span><h2>A conversation, with context</h2><p>Ask about this project or reuse work for {project.customer}.</p></div><span className="project-context-pill">✦ {project.customer} context</span></header>
    <div className="project-workspace-tabs" role="tablist" aria-label="Project workspace"><button role="tab" aria-selected={tab === 'conversation'} onClick={() => setTab('conversation')}>Conversation <span>{messages.length}</span></button><button role="tab" aria-selected={tab === 'brief'} onClick={() => setTab('brief')}>Brief & transcript {savedBrief && <span>Saved</span>}</button><button role="tab" aria-selected={tab === 'requirements'} onClick={() => setTab('requirements')}>Client requirements</button></div>
    {messages.some((message) => message.mode === 'preview') && <div className="project-preview-notice">Preview mode: the LLM is unavailable. Suggestions use the saved project records; review item matches before creating a draft.</div>}
    {error && <div className="finder-feedback finder-error" role="alert">{error}</div>}
    {tab === 'requirements' ? <ProjectRequirements project={project} onUpdated={onUpdated} /> : tab === 'brief' ? <div className="project-brief"><label htmlFor="project-brief"><strong>Project brief & transcript</strong><span>Paste meeting notes, a customer request or a transcript. Somec will use this as project context.</span></label><textarea id="project-brief" aria-label="Project brief & transcript" rows={10} maxLength={30000} value={brief} placeholder="What did the customer ask for? Scope, requirements, decisions, exclusions…" onChange={(event) => { setBrief(event.target.value); setSaved(false); }} /><div className="project-brief-actions"><span className="small muted">{brief.length.toLocaleString()} / 30,000 characters</span><span>{saved && <span className="small project-saved" role="status">Saved to this project</span>} <button className="primary" disabled={busy || brief === savedBrief} onClick={() => void saveBrief()}>{busy ? 'Saving…' : 'Save brief'}</button></span></div></div> : <>
      <div className="project-conversation" role="log" aria-label="Project conversation" aria-live="polite">
        {loading && <p className="muted small">Loading conversation…</p>}
        {!loading && !messages.length && !pending && <div className="project-chat-empty"><span className="project-chat-symbol" aria-hidden="true">✦</span><h3>Start with what the customer needs.</h3><p>Find previous work, ask what was included, or describe a variation. Your conversation stays with this project.</p><div className="project-prompts">{['Summarize this project', 'What did we quote for this customer last time?', 'Same as last time, but without the jacuzzi'].map((prompt) => <button key={prompt} onClick={() => setQuery(prompt)}>{prompt} ↗</button>)}</div></div>}
        {messages.map((message) => {
          const proposal = message.proposal;
          const quotation = proposal ? allQuotations.find((item) => item.id === proposal.sourceQuotationId) : null;
          return <article key={message.id} className={`project-message ${message.role}`}><div className="project-message-meta"><strong>{message.role === 'user' ? 'You' : 'Somec'}{message.role === 'assistant' && message.mode === 'preview' && <span className="project-preview-label">Preview · record matching</span>}</strong><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time></div><p>{message.content}</p>{proposal && <div className="project-proposal"><span className="project-overline">Proposed revision</span><strong>{proposal.title}</strong><span className="small muted">Based on {quotation?.reference ?? 'source quotation'} · {proposal.excludeItemIds.length} items excluded</span>{quotation && <div className="project-exclusions">{quotation.items.filter((item) => proposal.excludeItemIds.includes(item.id)).map((item) => <span key={item.id}>− {item.description}</span>)}</div>}{message.createdQuotationId ? <button onClick={() => navigate({ page: 'quotation', id: message.createdQuotationId!, tab: 'elenco' })}>Open created draft →</button> : <button className="primary" disabled={!quotation || busy} onClick={() => { setReview(message); setDraftName(proposal.title); setReference(''); }}>Review new draft →</button>}</div>}</article>;
        })}
        {pending && <><article className="project-message user"><div className="project-message-meta"><strong>You</strong></div><p>{pending}</p></article><p className="project-thinking" role="status">✦ Reading the project and previous quotations…</p></>}
        <div ref={bottom} />
      </div>
      <form className="project-composer" onSubmit={(event) => void ask(event)}><div><textarea aria-label="Ask about this project" rows={2} value={query} maxLength={6000} placeholder="Same project for this customer, but without the jacuzzi…" disabled={loading} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><button className="primary" disabled={loading || busy || !query.trim()}>{busy ? 'Thinking…' : 'Send ↑'}</button></div><span>Uses this project, its saved brief and {project.customer}’s quotations. Proposed changes are reviewed before creating a draft.</span></form>
    </>}
    {review && source && <div className="modal-backdrop" role="presentation"><form className="panel stack add-quotation-modal project-review" role="dialog" aria-modal="true" aria-labelledby="review-draft-title" onSubmit={(event) => void createDraft(event)}><span className="project-overline">Review revision</span><h2 id="review-draft-title">Create a new draft</h2><p className="muted small">Copying {source.reference} into {project.name} for {project.customer}.</p>{error && <p className="error-box" role="alert">{error}</p>}<div className="project-review-counts"><span><strong>{kept.length}</strong> items kept</span><span><strong>{excluded.length}</strong> excluded</span></div>{excluded.length > 0 && <div className="project-review-removed"><strong>Excluded from the new draft</strong>{excluded.map((item) => <div key={item.id}>− {item.description} <small>{item.quantity} {item.unit}</small></div>)}</div>}<details><summary>View {kept.length} retained items</summary>{kept.map((item) => <p className="small" key={item.id}>{item.description} · {item.quantity} {item.unit}</p>)}</details><p className="small muted">Estimated retained cost: {fmtMoney(kept.reduce((total, item) => total + lineCost(item), 0))}{kept.some((item) => item.unitCostOverride === null && item.historicalUnitCost === null) ? ' · incomplete: some items have no cost' : ''}</p><label className="field">Draft name *<input required maxLength={200} value={draftName} onChange={(event) => setDraftName(event.target.value)} /></label><label className="field">Reference *<input required maxLength={100} value={reference} placeholder="e.g. TM2126-01" onChange={(event) => setReference(event.target.value)} /></label><p className="small muted">The original quotation stays unchanged. Quantities, dimensions and cost overrides are copied for retained items.</p><div className="row modal-actions"><button type="button" disabled={busy} onClick={() => setReview(null)}>Cancel</button><button className="primary" disabled={busy || !draftName.trim() || !reference.trim()}>{busy ? 'Creating…' : 'Create draft quotation'}</button></div></form></div>}
  </section>;
}
