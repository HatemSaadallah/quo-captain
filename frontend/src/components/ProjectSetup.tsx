import { useEffect, useState } from 'react';
import { api, type CatalogFacets, type Project } from '../api';

interface Props {
  facets: CatalogFacets | null;
  projects: Project[];
  current: Project | null;
  onSelect: (p: Project | null) => void;
  onChanged: () => void;
  onError: (msg: string) => void;
}

const today = (): string => new Date().toISOString().slice(0, 10);

export function ProjectSetup({ facets, projects, current, onSelect, onChanged, onError }: Props) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: '', customer: '', reference: '', date: today(), estimator: '', templateWorkbook: '' });
  const templates = facets?.workbooks ?? [];
  const [seenProjects, setSeenProjects] = useState(false);
  useEffect(() => {
    // open the form automatically only for a first-time user with no projects at all
    if (!seenProjects && facets) {
      setSeenProjects(true);
      if (projects.length === 0) setCreating(true);
    }
  }, [facets, projects, seenProjects]);

  const create = async (): Promise<void> => {
    try {
      const p = await api.createProject({ ...draft, templateWorkbook: draft.templateWorkbook || templates[0]?.workbook });
      onChanged();
      onSelect(p);
      setCreating(false);
      setDraft({ name: '', customer: '', reference: '', date: today(), estimator: '', templateWorkbook: '' });
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const patch = async (field: keyof Project, value: string): Promise<void> => {
    if (!current) return;
    try {
      onSelect(await api.updateProject(current.id, { [field]: value }));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async (): Promise<void> => {
    if (!current || !confirm(`Delete project "${current.name}" and its cart?`)) return;
    await api.deleteProject(current.id);
    onSelect(null);
    onChanged();
  };

  const tplInfo = current ? templates.find((t) => t.workbook === current.templateWorkbook) : undefined;

  return (
    <section className="panel">
      <h2>
        A · Project setup
        <span className="muted small">quotation cost-analysis project</span>
      </h2>
      <div className="row" style={{ marginBottom: 10 }}>
        <select value={current?.id ?? ''} onChange={(e) => onSelect(projects.find((p) => p.id === e.target.value) ?? null)} style={{ flex: 1 }}>
          <option value="">— select an existing project —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.reference || '(no ref)'} · {p.name} · {p.items.length} items
            </option>
          ))}
        </select>
        <button onClick={() => setCreating((v) => !v)}>{creating ? 'Cancel' : '+ New project'}</button>
        {current && (
          <button className="danger" onClick={remove}>
            Delete
          </button>
        )}
      </div>

      {creating && (
        <div className="stack" style={{ border: '1px dashed var(--line)', borderRadius: 8, padding: 10 }}>
          <div className="grid2">
            <label className="field">
              Project name *<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Nave 4 - Balcony" />
            </label>
            <label className="field">
              Customer<input value={draft.customer} onChange={(e) => setDraft({ ...draft, customer: e.target.value })} placeholder="APEXA" />
            </label>
            <label className="field">
              Reference / offer n° * <input value={draft.reference} onChange={(e) => setDraft({ ...draft, reference: e.target.value })} placeholder="TM2099-00" />
            </label>
            <label className="field">
              Date<input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
            </label>
            <label className="field">
              Estimator<input value={draft.estimator} onChange={(e) => setDraft({ ...draft, estimator: e.target.value })} />
            </label>
            <label className="field">
              Template workbook
              <select value={draft.templateWorkbook || templates[0]?.workbook || ''} onChange={(e) => setDraft({ ...draft, templateWorkbook: e.target.value })}>
                {templates.map((t) => (
                  <option key={t.workbook} value={t.workbook}>
                    {t.workbook} — {t.projectName} ({t.itemCount} items)
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="row">
            <button className="primary" onClick={create} disabled={!draft.name.trim() || !draft.reference.trim()}>
              Create project
            </button>
            <span className="muted small">The reference becomes the Excel file name and the offer number in DATI GEN.!C5.</span>
          </div>
        </div>
      )}

      {current && !creating && (
        <div className="stack">
          <div className="grid2">
            <label className="field">
              Project name<input defaultValue={current.name} key={current.id + 'n'} onBlur={(e) => e.target.value !== current.name && patch('name', e.target.value)} />
            </label>
            <label className="field">
              Customer<input defaultValue={current.customer} key={current.id + 'c'} onBlur={(e) => e.target.value !== current.customer && patch('customer', e.target.value)} />
            </label>
            <label className="field">
              Reference / offer n°<input defaultValue={current.reference} key={current.id + 'r'} onBlur={(e) => e.target.value !== current.reference && patch('reference', e.target.value)} />
            </label>
            <label className="field">
              Date<input type="date" defaultValue={current.date} key={current.id + 'd'} onBlur={(e) => e.target.value !== current.date && patch('date', e.target.value)} />
            </label>
            <label className="field">
              Estimator<input defaultValue={current.estimator} key={current.id + 'e'} onBlur={(e) => e.target.value !== current.estimator && patch('estimator', e.target.value)} />
            </label>
            <label className="field">
              Template workbook
              <select value={current.templateWorkbook} onChange={(e) => patch('templateWorkbook', e.target.value)}>
                {templates.map((t) => (
                  <option key={t.workbook} value={t.workbook}>
                    {t.workbook} — {t.projectName}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {tplInfo && (
            <div className="small muted">
              Template {tplInfo.offerNo ?? tplInfo.workbook}: client {tplInfo.client}, {tplInfo.itemCount} historical items, {tplInfo.analysisSheetCount} analysis sheets, {tplInfo.freeItemRows} free item rows, historical total cost{' '}
              {tplInfo.totalCost?.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}. The generated file starts from a copy of it, with its items emptied; its DATI GEN. price list is what the copied analyses look up.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
