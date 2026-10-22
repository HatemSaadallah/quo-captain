import { useEffect, useState } from 'react';
import { api, fmtMoney, type Project, type ProjectContact, quotationCost } from '../api';
import { navigate } from '../route';
import { Icon } from './Icon';
import '../materials.css';
import '../dashboard.css';

export function CustomersPage({ customerId, onError }: { customerId?: string; onError: (message: string) => void }) {
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [contacts, setContacts] = useState<ProjectContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [ai, setAi] = useState<{ reply: string; customers: string[]; mode: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const askAi = async (): Promise<void> => {
    if (!query.trim()) return;
    setAsking(true);
    try { setAi(await api.searchCustomers(query.trim())); setPage(1); } catch (error) { onError(error instanceof Error ? error.message : String(error)); } finally { setAsking(false); }
  };
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => {
    Promise.all([api.customers(), api.projects(), api.projectContacts()])
      .then(([customerRows, projectRows, contactRows]) => { setCustomers(customerRows); setProjects(projectRows); setContacts(contactRows); })
      .catch((error: unknown) => onError(error instanceof Error ? error.message : String(error)))
      .finally(() => setLoading(false));
  }, [onError]);
  const summaries = customers.map((customer) => {
    const customerProjects = projects.filter((project) => project.customerId === customer.id);
    const customerContacts = contacts.filter((contact) => contact.company === customer.name);
    return { ...customer, projects: customerProjects, contacts: customerContacts, quotationCount: customerProjects.reduce((sum, project) => sum + project.quotations.length, 0) };
  });
  const search = query.trim().toLowerCase();
  // Enter runs a natural-language search; its ranking replaces the instant keyword filter.
  const results = ai ? ai.customers.flatMap((name) => summaries.filter((c) => c.name === name)) : summaries.filter((customer) => [customer.name, ...customer.projects.map((project) => project.name), ...customer.contacts.flatMap((contact) => [contact.name, contact.email])].join(' ').toLowerCase().includes(search))
    .sort((a, b) => sort === 'projects' ? b.projects.length - a.projects.length || a.name.localeCompare(b.name) : sort === 'quotations' ? b.quotationCount - a.quotationCount || a.name.localeCompare(b.name) : sort === 'name-desc' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name));
  const pages = Math.max(1, Math.ceil(results.length / pageSize));
  const selected = customerId ? summaries.find((customer) => customer.id === customerId) : null;
  const quotations = selected?.projects.flatMap((project) => project.quotations) ?? [];
  const cost = (rows: Project['quotations']): number => rows.reduce((total, quotation) => total + quotationCost(quotation), 0);
  const unknownCosts = quotations.reduce((total, quotation) => total + quotation.items.filter((item) => item.unitCostOverride === null && item.historicalUnitCost === null).length, 0);
  const activity = new Map<string, number>();
  for (const quotation of quotations) { const month = quotation.date.slice(0, 7); if (/^\d{4}-\d{2}$/.test(month)) activity.set(month, (activity.get(month) ?? 0) + 1); }
  const months = [...activity.entries()].sort(([a], [b]) => a.localeCompare(b));
  const maxActivity = Math.max(...months.map(([, value]) => value), 1);
  const maxProjectCost = Math.max(...(selected?.projects.map((project) => cost(project.quotations)) ?? []), 1);
  return <div className="inventory-page">
    <header className="inventory-heading"><div><div className="inventory-eyebrow">Customer relationships</div><h1>{customerId ? selected?.name ?? 'Customer' : 'Customers'}</h1><p>{customerId ? 'Your contacts, project history and quotation activity.' : 'The people and companies behind your projects.'}</p></div>{customerId ? <div className="customer-detail-actions"><button onClick={() => navigate({ page: 'dashboard', customerId })}>Customer dashboard ↗</button><button onClick={() => navigate({ page: 'customers' })}>← All customers</button></div> : <div className="inventory-heading-count"><strong>{customers.length}</strong><span>customers</span></div>}</header>
    {loading && <div className="inventory-empty">Loading customers…</div>}
    {!loading && <div className="dash-kpis customer-summary">{(selected ? [{ label: 'Projects', value: selected.projects.length, note: 'Customer project portfolio' }, { label: 'Quotations', value: selected.quotationCount, note: `${quotations.filter((quotation) => quotation.status === 'active').length} confirmed · ${quotations.filter((quotation) => quotation.status === 'draft').length} drafts` }, { label: 'Contacts', value: selected.contacts.length, note: 'People in your directory' }, { label: 'Estimated cost', value: fmtMoney(cost(quotations)), note: unknownCosts ? `Partial · ${unknownCosts} rows have no cost` : 'Quoted costs, not selling prices' }] : [{ label: 'Customers', value: customers.length, note: 'Companies in your workspace' }, { label: 'Projects', value: projects.length, note: 'Across all customer accounts' }, { label: 'Quotations', value: projects.reduce((sum, project) => sum + project.quotations.length, 0), note: 'Draft and confirmed quotations' }, { label: 'Contacts', value: contacts.length, note: 'People in the contact directory' }]).map((card) => <section className="dash-kpi" key={card.label}><div><span>{card.label}</span><span className="dash-kpi-icon" aria-hidden="true">↗</span></div><strong>{card.value}</strong><small>{card.note}</small></section>)}</div>}
    {customerId ? selected ? <>
      <div className="dash-chart-grid">
        <section className="dash-card"><div className="dash-card-heading"><div><h2>Quotation activity</h2><p>Quotations by month · months with activity</p></div></div>{months.length ? <svg viewBox="0 0 640 200" className="dash-trend" role="img" aria-label="Customer monthly quotation activity histogram">{months.map(([month, count], index) => { const width = 560 / months.length; const height = count / maxActivity * 135; return <g key={month}><rect x={50 + index * width + width * .2} y={155 - height} width={width * .6} height={height} fill="#88b2cf" rx="3"><title>{month}: {count} quotations</title></rect><text x={50 + index * width + width / 2} y={148 - height} textAnchor="middle">{count}</text>{(months.length < 9 || index === 0 || index === months.length - 1 || index === Math.floor(months.length / 2)) && <text x={50 + index * width + width / 2} y="183" textAnchor="middle">{month}</text>}</g>; })}</svg> : <p className="muted small">No quotation activity yet.</p>}</section>
        <section className="dash-card"><div className="dash-card-heading"><div><h2>Project cost distribution</h2><p>Estimated quotation costs by project</p></div></div><div className="customer-cost-bars">{[...selected.projects].sort((a, b) => cost(b.quotations) - cost(a.quotations)).slice(0, 6).map((project) => <button key={project.id} onClick={() => navigate({ page: 'projects', id: project.id })}><div><span>{project.name}</span><strong>{fmtMoney(cost(project.quotations))}</strong></div><span className="cost-track"><i style={{ width: `${cost(project.quotations) / maxProjectCost * 100}%` }} /></span></button>)}</div></section>
      </div>
      <div className="customer-detail-layout"><section className="dash-card"><div className="dash-card-heading"><div><h2>Projects & quotations</h2><p>Open a project or quotation to continue working</p></div></div><div>{selected.projects.map((project) => <section className="customer-project-row" key={project.id}><div className="customer-project-title"><button onClick={() => navigate({ page: 'projects', id: project.id })}>{project.name} ↗</button><span>{project.quotations.length} quotations</span></div>{project.quotations.map((quotation) => <button className="customer-quote-row" key={quotation.id} onClick={() => navigate({ page: 'quotation', id: quotation.id, tab: 'elenco' })}><span><strong>{quotation.reference}</strong><small>{quotation.name}</small></span><span className={`project-status ${quotation.status}`}>{quotation.status === 'active' ? 'Confirmed' : 'Draft'}</span></button>)}{!project.quotations.length && <p className="small muted">No quotations yet.</p>}</section>)}</div></section>
      <aside className="dash-card"><div className="dash-card-heading"><div><h2>Your contacts</h2><p>People at {selected.name}</p></div></div><div className="customer-contact-cards">{selected.contacts.map((contact) => <div className="customer-contact-card" key={contact.id}><span className="customer-avatar" aria-hidden="true">{contact.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><div><strong>{contact.name}</strong><small>{contact.role}</small><a href={`mailto:${contact.email}`}>{contact.email}</a></div></div>)}</div>{!selected.contacts.length && <p className="small muted">No directory contacts recorded.</p>}</aside></div>
    </> : !loading && <p className="muted">Customer not found.</p> : <section className="inventory-card">
      <div className="inventory-toolbar"><label className="inventory-search"><Icon name="search" size={16} /><input aria-label="Search customers" placeholder="Search or ask: “who did we quote balconies for this year?” — press Enter" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); setAi(null); }} onKeyDown={(event) => { if (event.key === 'Enter') void askAi(); }} />{asking && <span className="small muted">Searching…</span>}</label><select aria-label="Sort customers" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="name">Name A–Z</option><option value="name-desc">Name Z–A</option><option value="projects">Most projects</option><option value="quotations">Most quotations</option></select></div>{ai && <div className="finder-feedback" role="status" style={{ margin: '0 0 12px', borderRadius: 10, borderTop: '1px solid var(--line)' }}><span className="finder-spark" aria-hidden="true">✦</span><div>{ai.mode === 'preview' && <span className="project-preview-label">Keyword match · AI unavailable</span>}{ai.reply}<span className="small muted">{ai.customers.length} matching {ai.customers.length === 1 ? 'customer' : 'customers'}</span></div><button type="button" onClick={() => { setAi(null); setQuery(''); }}>Show all</button></div>}
      <div className="table-scroll"><table className="inventory-table"><colgroup><col style={{ width: '35%' }} /><col style={{ width: '35%' }} /><col style={{ width: '15%' }} /><col style={{ width: '15%' }} /></colgroup><thead><tr><th>Customer</th><th>Contacts</th><th className="inventory-number">Projects</th><th className="inventory-number">Quotations</th></tr></thead><tbody>{results.slice((page - 1) * pageSize, page * pageSize).map((customer) => <tr key={customer.id}><td><div className="inventory-identity"><span className="customer-avatar" aria-hidden="true">{customer.name.slice(0, 2)}</span><div><button className="inventory-link" onClick={() => navigate({ page: 'customers', id: customer.id })}>{customer.name}<span className="inventory-link-arrow" aria-hidden="true">↗</span></button><div className="customer-subtitle">Customer account</div></div></div></td><td><span className="inventory-cell-main">{customer.contacts.map((contact) => contact.name).join(', ') || 'No contacts linked'}</span><span className="inventory-cell-sub">{customer.contacts.length} directory contacts</span></td><td className="inventory-number"><span className="inventory-count">{customer.projects.length}</span></td><td className="inventory-number"><span className="inventory-count">{customer.quotationCount}</span></td></tr>)}</tbody></table></div>{!loading && !results.length && <div className="inventory-empty">No customers match your search.</div>}
      <footer className="inventory-pagination"><span>{results.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, results.length)} of {results.length} customers</span><div><label>Rows per page<select aria-label="Customers per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></label><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span className="inventory-page-number">{page} / {pages}</span><button disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div></footer>
    </section>}
  </div>;
}
