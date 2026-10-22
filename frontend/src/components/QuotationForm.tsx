import { useEffect, useState, type FormEvent } from 'react';
import { api, type CatalogFacets, type Project, type Quotation } from '../api';

interface Props {
  facets: CatalogFacets | null;
  /** When given, the form edits this quotation; otherwise it creates one. */
  quotation?: Quotation;
  onSaved: (p: Quotation) => void;
  onError: (msg: string) => void;
  submitLabel?: string;
  estimator?: string;
}

const today = (): string => new Date().toISOString().slice(0, 10);

export function QuotationForm({ facets, quotation, onSaved, onError, submitLabel, estimator }: Props) {
  const templates = facets?.workbooks ?? [];
  const [projects, setProjects] = useState<Project[]>([]);
  const [draft, setDraft] = useState({
    name: quotation?.name ?? '',
    projectId: quotation?.projectId ?? '',
    reference: quotation?.reference ?? '',
    date: quotation?.date ?? today(),
    estimator: quotation?.estimator ?? estimator ?? '',
    templateWorkbook: quotation?.templateWorkbook ?? templates[0]?.workbook ?? '',
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.projects().then(setProjects).catch((err: unknown) => onError(err instanceof Error ? err.message : String(err))); }, [onError]);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...draft, templateWorkbook: draft.templateWorkbook || templates[0]?.workbook };
      await onSaved(quotation ? await api.updateQuotation(quotation.id, body) : await api.createQuotation(body));
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const tpl = templates.find((t) => t.workbook === (draft.templateWorkbook || templates[0]?.workbook));

  return (
    <form className="stack" onSubmit={(e) => void submit(e)} aria-label={quotation ? 'edit quotation' : 'new quotation'}>
      <div className="grid2">
        <label className="field">
          Quotation name *<input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Nave 4 - Balcony" />
        </label>
        <label className="field">
          Project *<select required value={draft.projectId} onChange={(e) => setDraft({ ...draft, projectId: e.target.value })}>
            <option value="" disabled>Select a project</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.customer}</option>)}
          </select>
        </label>
        <label className="field">
          Reference / offer n° *<input required value={draft.reference} onChange={(e) => setDraft({ ...draft, reference: e.target.value })} placeholder="TM2099-00" />
        </label>
        <label className="field">
          Date *<input required type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
        </label>
        <label className="field">
          Estimator *<input required value={draft.estimator} onChange={(e) => setDraft({ ...draft, estimator: e.target.value })} />
        </label>
        <label className="field">
          Template workbook (price list and budget structure)
          <select required value={draft.templateWorkbook || templates[0]?.workbook || ''} onChange={(e) => setDraft({ ...draft, templateWorkbook: e.target.value })}>
            {templates.map((t) => (
              <option key={t.workbook} value={t.workbook}>
                {t.offerNo ?? t.workbook} — {t.projectName} ({t.client})
              </option>
            ))}
          </select>
        </label>
      </div>
      {projects.length === 0 && <div className="small muted">Create a project and attach it to a customer in the Projects tab before creating a quotation.</div>}
      {tpl && (
        <div className="small muted">
          {tpl.offerNo ?? tpl.workbook.replace(/\s*Analisi\.xlsx$/i, '')}: client {tpl.client}, {tpl.itemCount} historical items, {tpl.analysisSheetCount} analysis sheets, price list and budget of this workbook are used for computed costs and for the optional Excel export.
        </div>
      )}
      <div className="row">
        <button className="primary" type="submit" disabled={busy || !draft.name.trim() || !draft.reference.trim() || !draft.projectId}>
          {busy ? '…' : (submitLabel ?? (quotation ? 'Save' : 'Create quotation'))}
        </button>
        <span className="muted small">The reference becomes the offer number (and the Excel file name).</span>
      </div>
    </form>
  );
}
