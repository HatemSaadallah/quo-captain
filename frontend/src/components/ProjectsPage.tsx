import { useEffect, useState, type FormEvent } from 'react';
import { api, type Project, type ProjectContact } from '../api';
import { navigate } from '../route';

export function ProjectsPage({ onError }: { onError: (message: string) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [contacts, setContacts] = useState<ProjectContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [customer, setCustomer] = useState('');
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [projectTabs, setProjectTabs] = useState<Record<string, 'quotations' | 'contacts'>>({});
  const [busy, setBusy] = useState(false);

  const refresh = (): void => { setLoading(true); api.projects().then(setProjects).catch((e: unknown) => onError(e instanceof Error ? e.message : String(e))).finally(() => setLoading(false)); };
  useEffect(() => { refresh(); api.projectContacts().then(setContacts).catch((e: unknown) => onError(e instanceof Error ? e.message : String(e))); }, []);

  const create = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.createProject({ name: name.trim(), customer: customer.trim(), contactIds });
      setName(''); setCustomer(''); setContactIds([]); setCreating(false); refresh();
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return <div className="stack">
    <div className="section-head"><div><h1 style={{ margin: 0, fontSize: 24 }}>Projects</h1><div className="muted small">Projects belong to a customer and can contain multiple quotations.</div></div><button className="primary" onClick={() => setCreating(true)}>＋ New project</button></div>
    {loading && <div className="muted">Loading projects…</div>}
    {!loading && projects.length === 0 && <section className="panel"><h2>No projects yet</h2><p className="muted">Create a customer project before creating its quotations.</p><button className="primary" onClick={() => setCreating(true)}>Create project</button></section>}
    <div className="project-grid">{projects.map((project) => <section className="panel project-card" key={project.id}>
      <div className="project-card-head"><div><h2>{project.name}</h2><div className="muted">Customer · {project.customer}</div></div><span className="cart-badge">{project.quotations.length} quotations</span></div>
      <div className="project-card-tabs" role="tablist" aria-label={`${project.name} details`}><button role="tab" aria-selected={(projectTabs[project.id] ?? 'quotations') === 'quotations'} className={(projectTabs[project.id] ?? 'quotations') === 'quotations' ? 'active' : ''} onClick={() => setProjectTabs({ ...projectTabs, [project.id]: 'quotations' })}>Quotations ({project.quotations.length})</button><button role="tab" aria-selected={projectTabs[project.id] === 'contacts'} className={projectTabs[project.id] === 'contacts' ? 'active' : ''} onClick={() => setProjectTabs({ ...projectTabs, [project.id]: 'contacts' })}>Contacts ({project.contacts.length})</button></div>
      {(projectTabs[project.id] ?? 'quotations') === 'contacts' ? <div className="project-contacts">{project.contacts.map((contact) => <span className="project-contact-chip" key={contact.id}>{contact.name}<small>{contact.role} · {contact.email}</small></span>)}</div> : project.quotations.length ? <div className="project-quotations">{project.quotations.map((q) => <button key={q.id} className="project-quotation" onClick={() => navigate({ page: 'quotation', id: q.id, tab: 'elenco' })}><span><strong>{q.reference}</strong><small>{q.name}</small></span><span className={`project-status ${q.status}`}>{q.status}</span></button>)}</div> : <p className="small muted">No quotations in this project yet.</p>}
    </section>)}</div>
    {creating && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setCreating(false)}><form className="panel stack add-quotation-modal" role="dialog" aria-modal="true" aria-labelledby="new-project-title" onSubmit={(e) => void create(e)}>
      <h2 id="new-project-title">New project</h2><label className="field">Project name *<input required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nave 5" /></label><label className="field">Customer *<input required value={customer} onChange={(e) => { setCustomer(e.target.value); setContactIds([]); }} placeholder="OMNIX" /></label><fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}><legend>Customer contacts *</legend><div className="project-contact-list">{contacts.filter((contact) => contact.company.toLocaleLowerCase() === customer.trim().toLocaleLowerCase()).map((contact) => <label className="project-contact-option" key={contact.id}><input type="checkbox" checked={contactIds.includes(contact.id)} onChange={(e) => setContactIds((current) => e.target.checked ? [...current, contact.id] : current.filter((id) => id !== contact.id))} />{contact.name}</label>)}{!contacts.some((contact) => contact.company.toLocaleLowerCase() === customer.trim().toLocaleLowerCase()) && <span className="small muted">No directory contacts found for this customer.</span>}</div></fieldset><div className="row modal-actions"><button type="button" onClick={() => setCreating(false)}>Cancel</button><button className="primary" disabled={busy || !name.trim() || !customer.trim() || contactIds.length === 0}>{busy ? 'Creating…' : 'Create project'}</button></div>
    </form></div>}
  </div>;
}
