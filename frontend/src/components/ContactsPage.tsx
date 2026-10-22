import { useMemo, useState } from 'react';
import type { Quotation } from '../api';

interface Props {
  quotations: Quotation[];
}

type Group = 'Installers' | 'Buyers' | 'Management' | 'Sales' | 'Accounting' | 'Estimating';

export interface Contact {
  name: string;
  role: string;
  group: Group;
  company: string;
  email: string;
  phone: string;
  location: string;
  tags?: string[];
  status?: string;
  /** Buyers: the customer name used on quotations. */
  customer?: string;
}

// Prototype directory: fictional people. Emails use .local domains (like the app's login accounts) so nothing can reach a real inbox.
const SOMEC = 'somec.local';
export const CONTACTS: Contact[] = [
  { name: 'Giulia Bortolin', role: 'Managing Director, Marine Division', group: 'Management', company: 'Somec', email: `g.bortolin@${SOMEC}`, phone: '+39 0422 812 101', location: 'San Vendemiano (TV)' },
  { name: 'Marco Dal Col', role: 'Operations Manager', group: 'Management', company: 'Somec', email: `m.dalcol@${SOMEC}`, phone: '+39 0422 812 104', location: 'San Vendemiano (TV)' },
  { name: 'Elena Furlan', role: 'Project Manager, Newbuildings', group: 'Management', company: 'Somec', email: `e.furlan@${SOMEC}`, phone: '+39 0422 812 117', location: 'San Vendemiano (TV)', tags: ['Nave 5', 'Nave 8'] },
  { name: 'Luca Pizzolato', role: 'Sales Director, Cruise', group: 'Sales', company: 'Somec', email: `l.pizzolato@${SOMEC}`, phone: '+39 0422 812 130', location: 'San Vendemiano (TV)', tags: ['APEXA', 'OMNIX'] },
  { name: 'Sara Zanin', role: 'Key Account Manager', group: 'Sales', company: 'Somec', email: `s.zanin@${SOMEC}`, phone: '+39 0422 812 133', location: 'San Vendemiano (TV)', tags: ['ACME'] },
  { name: 'Thomas Keller', role: 'Sales Engineer, Northern Europe', group: 'Sales', company: 'Somec', email: `t.keller@${SOMEC}`, phone: '+49 4961 920 044', location: 'Papenburg, DE', tags: ['Windscreens', 'Balconies'] },
  { name: 'Francesca Toffolo', role: 'Finance & Accounting Manager', group: 'Accounting', company: 'Somec', email: `f.toffolo@${SOMEC}`, phone: '+39 0422 812 150', location: 'San Vendemiano (TV)' },
  { name: 'Paolo Granzotto', role: 'Accounts Payable', group: 'Accounting', company: 'Somec', email: `p.granzotto@${SOMEC}`, phone: '+39 0422 812 152', location: 'San Vendemiano (TV)' },
  { name: 'Chiara Bet', role: 'Management Controller', group: 'Accounting', company: 'Somec', email: `c.bet@${SOMEC}`, phone: '+39 0422 812 155', location: 'San Vendemiano (TV)' },
  { name: 'Mock Estimator', role: 'Cost Estimator', group: 'Estimating', company: 'Somec', email: `estimator@${SOMEC}`, phone: '+39 0422 812 170', location: 'San Vendemiano (TV)', tags: ['Glazing', 'Flooring'] },
  { name: 'Andrea Coan', role: 'Senior Cost Estimator', group: 'Estimating', company: 'Somec', email: `a.coan@${SOMEC}`, phone: '+39 0422 812 172', location: 'San Vendemiano (TV)', tags: ['Prefab balconies'] },
  { name: 'Davide Marchesin', role: 'Site Manager, Installation', group: 'Installers', company: 'Somec Installation Team A', email: `d.marchesin@${SOMEC}`, phone: '+39 348 551 2201', location: 'Monfalcone, IT', tags: ['Glazing', 'Windscreens'], status: 'On site · Nave 5' },
  { name: 'Ivan Horvat', role: 'Lead Installer', group: 'Installers', company: 'Adriatica Montaggi Navali', email: 'i.horvat@adriaticamontaggi.local', phone: '+39 0481 410 778', location: 'Monfalcone, IT', tags: ['Balustrades', 'Handrails'], status: 'Available from Nov 2026' },
  { name: 'Mikko Lahtinen', role: 'Installation Supervisor', group: 'Installers', company: 'Baltic Marine Glazing Oy', email: 'mikko.lahtinen@balticglazing.local', phone: '+358 40 771 2290', location: 'Turku, FI', tags: ['Glazing', 'Sliding doors'], status: 'On site · Nave 8' },
  { name: 'Julien Morvan', role: 'Team Leader', group: 'Installers', company: 'Atlantique Fit-Out', email: 'j.morvan@atlantiquefitout.local', phone: '+33 6 41 22 87 15', location: 'Saint-Nazaire, FR', tags: ['Balcony dividers', 'Glazing'], status: 'Available' },
  { name: 'Stefan Brinkmann', role: 'Flooring Specialist', group: 'Installers', company: 'Ems Deck Systems GmbH', email: 's.brinkmann@emsdeck.local', phone: '+49 4961 66 3012', location: 'Papenburg, DE', tags: ['Teak flooring', 'Resin flooring'], status: 'Available from Dec 2026' },
  { name: 'Roberto Pavan', role: 'Flooring Team Leader', group: 'Installers', company: 'Somec Installation Team B', email: `r.pavan@${SOMEC}`, phone: '+39 348 551 2214', location: 'Marghera, IT', tags: ['Raised floors', 'Resin flooring'], status: 'Available' },
  { name: 'Anna Virtanen', role: 'Procurement Manager, Outfitting', group: 'Buyers', company: 'APEXA', customer: 'APEXA', email: 'anna.virtanen@apexa.local', phone: '+358 2 2668 4410', location: 'Turku, FI' },
  { name: 'Jonas Weber', role: 'Buyer, Glazing & Balconies', group: 'Buyers', company: 'APEXA', customer: 'APEXA', email: 'jonas.weber@apexa.local', phone: '+49 4961 81 2233', location: 'Papenburg, DE' },
  { name: 'Claire Lefèvre', role: 'Purchasing Manager', group: 'Buyers', company: 'OMNIX', customer: 'OMNIX', email: 'claire.lefevre@omnix.local', phone: '+33 2 51 10 44 21', location: 'Saint-Nazaire, FR' },
  { name: 'Matteo Rinaldi', role: 'Senior Buyer, Hull Outfitting', group: 'Buyers', company: 'OMNIX', customer: 'OMNIX', email: 'matteo.rinaldi@omnix.local', phone: '+39 040 319 5521', location: 'Trieste, IT' },
  { name: 'Hannah Larsen', role: 'Category Buyer, Accommodation', group: 'Buyers', company: 'ACME', customer: 'ACME', email: 'hannah.larsen@acme.local', phone: '+47 70 21 66 08', location: 'Ålesund, NO' },
  { name: 'Pietro Conte', role: 'Procurement Specialist', group: 'Buyers', company: 'ACME', customer: 'ACME', email: 'pietro.conte@acme.local', phone: '+39 0481 488 120', location: 'Monfalcone, IT' },
];

const GROUPS: Group[] = ['Installers', 'Buyers', 'Management', 'Sales', 'Accounting', 'Estimating'];
const COLORS = ['#0d5c8f', '#1d7a46', '#8a4bb8', '#b4561b', '#0f7c86', '#a8325e', '#4f5bd5'];
const initials = (n: string): string =>
  n
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('');
const color = (n: string): string => COLORS[[...n].reduce((h, c) => h + c.charCodeAt(0), 0) % COLORS.length];

export function ContactsPage({ quotations }: Props) {
  const [group, setGroup] = useState<Group | ''>('');
  const [q, setQ] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const byCustomer = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of quotations) m.set(x.customer, (m.get(x.customer) ?? 0) + 1);
    return m;
  }, [quotations]);

  const t = q.trim().toLowerCase();
  const list = CONTACTS.filter((c) => (!group || c.group === group) && (!t || `${c.name} ${c.role} ${c.company} ${c.email} ${c.location} ${(c.tags ?? []).join(' ')}`.toLowerCase().includes(t)));

  const copy = (email: string): void => {
    void navigator.clipboard?.writeText(email).catch(() => undefined);
    setCopied(email);
    window.setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <h1 style={{ margin: 0 }}>Contacts</h1>
          <div className="muted small">Installers, shipyard buyers and Somec staff involved in quotations</div>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, company, skill, city…" style={{ maxWidth: 320 }} aria-label="search contacts" />
      </div>
      <div className="status-tabs">
        <button className={group === '' ? 'on' : ''} onClick={() => setGroup('')}>
          All <span>{CONTACTS.length}</span>
        </button>
        {GROUPS.map((g) => (
          <button key={g} className={group === g ? 'on' : ''} onClick={() => setGroup(g)}>
            {g} <span>{CONTACTS.filter((c) => c.group === g).length}</span>
          </button>
        ))}
      </div>
      <div className="cgrid">
        {list.map((c) => (
          <div key={c.email} className="ccard">
            <div className="ctop">
              <div className="avatar" style={{ background: color(c.name) }}>
                {initials(c.name)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="cname">{c.name}</div>
                <div className="crole">{c.role}</div>
                <div className="ccompany">{c.company}</div>
              </div>
              <span className={`cgroup g-${c.group.toLowerCase()}`}>{c.group}</span>
            </div>
            <div className="cline">
              <span className="cicon">✉</span>
              <span className="cemail">{c.email}</span>
              <button className="copy" onClick={() => copy(c.email)} title="Copy email">
                {copied === c.email ? '✓' : 'Copy'}
              </button>
            </div>
            <div className="cline">
              <span className="cicon">☎</span>
              {c.phone}
            </div>
            <div className="cline">
              <span className="cicon">⌖</span>
              {c.location}
            </div>
            {(c.tags?.length || c.status || c.customer) && (
              <div className="pmats" style={{ marginTop: 8 }}>
                {c.status && <span className={`reason ${c.status.startsWith('On site') ? 'busy' : ''}`}>{c.status}</span>}
                {c.customer && <span className="reason">{byCustomer.get(c.customer) ?? 0} quotations</span>}
                {c.tags?.map((tag) => (
                  <span key={tag} className="mat">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {list.length === 0 && <div className="muted">No contact matches.</div>}
      </div>
    </div>
  );
}
