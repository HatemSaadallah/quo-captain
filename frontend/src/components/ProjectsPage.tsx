import { useEffect, useState, type FormEvent } from 'react';
import { api, type Project, type ProjectContact } from '../api';
import { navigate } from '../route';
import { ProjectFinder } from './ProjectFinder';
import { ProjectWorkspace } from './ProjectWorkspace';
import '../projects.css';

export function ProjectsPage({ projectId, onError, onUpdated }: { projectId?: string; onError: (message: string) => void; onUpdated?: () => void }) {
  const [query, setQuery] = useState('');
  const [matchedIds, setMatchedIds] = useState<string[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [contacts, setContacts] = useState<ProjectContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [name, setName] = useState('');
  const [customer, setCustomer] = useState('');
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [projectTabs, setProjectTabs] = useState<Record<string, 'quotations' | 'contacts'>>({});
  const [editingContacts, setEditingContacts] = useState<string | null>(null);
  const [editedContactIds, setEditedContactIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = (): void => { setLoading(true); api.projects().then(setProjects).catch((e: unknown) => onError(e instanceof Error ? e.message : String(e))).finally(() => setLoading(false)); };
  useEffect(() => { refresh(); api.projectContacts().then(setContacts).catch((e: unknown) => onError(e instanceof Error ? e.message : String(e))); }, []);

  const create = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    try {
      const body = { name: name.trim(), customer: customer.trim(), contactIds };
      if (editingProject) await api.updateProject(editingProject.id, body);
      else await api.createProject(body);
      setName(''); setCustomer(''); setContactIds([]); setEditingProject(null); setCreating(false); refresh(); onUpdated?.();
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const saveContacts = async (project: Project): Promise<void> => {
    setBusy(true);
    try {
      await api.updateProjectContacts(project.id, editedContactIds);
      setEditingContacts(null); refresh();
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const selected = projects.find((project) => project.id === projectId);
  const visible = projectId ? projects.filter((project) => project.id === projectId) : matchedIds ? matchedIds.flatMap((id) => projects.filter((project) => project.id === id)) : projects.filter((project) => [project.name, project.customer, ...project.quotations.map((quotation) => `${quotation.reference} ${quotation.name}`)].join(' ').toLowerCase().includes(query.toLowerCase()));
  return <div className="stack">
    <div className="section-head"><div><h1 style={{ margin: 0, fontSize: 24 }}>{selected?.name ?? 'Projects'}</h1><div className="muted small">{selected ? `${selected.customer} · ${selected.quotations.length} quotations · ${selected.contacts.length} contacts` : 'Find a project, open its workspace, and build on what you’ve done before.'}</div></div>{projectId && <button onClick={() => navigate({ page: 'projects' })}>← All projects</button>}<button className="primary" onClick={() => { setEditingProject(null); setName(''); setCustomer(''); setContactIds([]); setCreating(true); }}>＋ New project</button></div>
    {!projectId && <ProjectFinder projects={projects} onQuery={setQuery} onMatches={setMatchedIds} />}
    {selected && <ProjectWorkspace key={selected.id} project={selected} projects={projects} onUpdated={() => { refresh(); onUpdated?.(); }} />}
    {!loading && projectId && !selected && <section className="panel">Project not found. <button onClick={() => navigate({ page: 'projects' })}>All projects</button></section>}
    {!loading && !projectId && projects.length > 0 && !visible.length && <section className="panel muted">No matching projects. Try a customer name or ask Somec to describe the project you need.</section>}
    {loading && <div className="muted">Loading projects…</div>}
    {!loading && projects.length === 0 && <section className="panel"><h2>No projects yet</h2><p className="muted">Create a customer project before creating its quotations.</p><button className="primary" onClick={() => { setEditingProject(null); setName(''); setCustomer(''); setContactIds([]); setCreating(true); }}>Create project</button></section>}
    <div className="project-grid">{visible.map((project) => <section className="panel project-card" key={project.id}>
      <div className="project-card-head"><div><h2><button className="project-open-link" onClick={() => navigate({ page: 'projects', id: project.id })}>{project.name}<span aria-hidden="true"> ↗</span></button></h2><div className="muted">Customer · <button className="customer-link" onClick={() => navigate({ page: 'customers', id: project.customerId })}>{project.customer}</button></div></div><button onClick={() => { setEditingProject(project); setName(project.name); setCustomer(project.customer); setContactIds(project.contacts.map((contact) => contact.id)); setCreating(true); }}>Edit project</button></div>
      <div className="project-card-tabs" role="tablist" aria-label={`${project.name} details`}><button role="tab" aria-selected={(projectTabs[project.id] ?? 'quotations') === 'quotations'} className={(projectTabs[project.id] ?? 'quotations') === 'quotations' ? 'active' : ''} onClick={() => setProjectTabs({ ...projectTabs, [project.id]: 'quotations' })}>Quotations ({project.quotations.length})</button><button role="tab" aria-selected={projectTabs[project.id] === 'contacts'} className={projectTabs[project.id] === 'contacts' ? 'active' : ''} onClick={() => setProjectTabs({ ...projectTabs, [project.id]: 'contacts' })}>Contacts ({project.contacts.length})</button></div>
      {(projectTabs[project.id] ?? 'quotations') === 'contacts' ? <div>
        {editingContacts === project.id ? <><div className="project-contact-list">{contacts.filter((contact) => contact.company === project.customer).map((contact) => <label className="project-contact-option" key={contact.id}><input type="checkbox" checked={editedContactIds.includes(contact.id)} onChange={(e) => setEditedContactIds((current) => e.target.checked ? [...current, contact.id] : current.filter((id) => id !== contact.id))} />{contact.name}</label>)}</div><div className="row" style={{ marginTop: 8 }}><button onClick={() => setEditingContacts(null)}>Cancel</button><button className="primary" disabled={busy || !editedContactIds.length} onClick={() => void saveContacts(project)}>{busy ? 'Saving…' : 'Save contacts'}</button></div></> : <><div className="project-contacts">{project.contacts.map((contact) => <span className="project-contact-chip" key={contact.id}>{contact.name}<small>{contact.role} · {contact.email}</small></span>)}</div><button onClick={() => { setEditedContactIds(project.contacts.map((contact) => contact.id)); setEditingContacts(project.id); }}>Manage contacts</button></>}
      </div> : project.quotations.length ? <div className="project-quotations">{project.quotations.map((q) => <button key={q.id} className="project-quotation" onClick={() => navigate({ page: 'quotation', id: q.id, tab: 'elenco' })}><span><strong>{q.reference}</strong><small>{q.name}</small></span><span className={`project-status ${q.status}`}>{q.status}</span></button>)}</div> : <p className="small muted">No quotations in this project yet.</p>}
    </section>)}</div>
    {creating && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setCreating(false)}><form className="panel stack add-quotation-modal" role="dialog" aria-modal="true" aria-labelledby="new-project-title" onSubmit={(e) => void create(e)}>
      <h2 id="new-project-title">{editingProject ? 'Edit project' : 'New project'}</h2><label className="field">Project name *<input required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nave 5" /></label><label className="field">Customer *<select required value={customer} onChange={(e) => { setCustomer(e.target.value); setContactIds([]); }}><option value="" disabled>Select a customer</option>{[...new Set(contacts.map((contact) => contact.company))].map((company) => <option key={company} value={company}>{company}</option>)}</select></label><fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}><legend>Customer contacts *</legend><div className="project-contact-list">{contacts.filter((contact) => contact.company === customer).map((contact) => <label className="project-contact-option" key={contact.id}><input type="checkbox" checked={contactIds.includes(contact.id)} onChange={(e) => setContactIds((current) => e.target.checked ? [...current, contact.id] : current.filter((id) => id !== contact.id))} />{contact.name}</label>)}</div></fieldset><div className="row modal-actions"><button type="button" onClick={() => setCreating(false)}>Cancel</button><button className="primary" disabled={busy || !name.trim() || !customer || contactIds.length === 0}>{busy ? 'Saving…' : editingProject ? 'Save changes' : 'Create project'}</button></div>
    </form></div>}
  </div>;
}
