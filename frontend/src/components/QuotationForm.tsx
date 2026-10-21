import { useState, type FormEvent } from 'react';
import { api, type CatalogFacets, type Quotation } from '../api';

interface Props {
  facets: CatalogFacets | null;
  /** When given, the form edits this quotation; otherwise it creates one. */
  quotation?: Quotation;
  onSaved: (p: Quotation) => void;
  onError: (msg: string) => void;
  submitLabel?: string;
}

const today = (): string => new Date().toISOString().slice(0, 10);

export function QuotationForm({ facets, quotation, onSaved, onError, submitLabel }: Props) {
  const templates = facets?.workbooks ?? [];
  const [draft, setDraft] = useState({
    name: quotation?.name ?? '',
    customer: quotation?.customer ?? '',
    reference: quotation?.reference ?? '',
    date: quotation?.date ?? today(),
    estimator: quotation?.estimator ?? '',
    templateWorkbook: quotation?.templateWorkbook ?? templates[0]?.workbook ?? '',
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...draft, templateWorkbook: draft.templateWorkbook || templates[0]?.workbook };
      onSaved(quotation ? await api.updateQuotation(quotation.id, body) : await api.createQuotation(body));
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
          Customer<input value={draft.customer} onChange={(e) => setDraft({ ...draft, customer: e.target.value })} placeholder="APEXA" />
        </label>
        <label className="field">
          Reference / offer n° *<input required value={draft.reference} onChange={(e) => setDraft({ ...draft, reference: e.target.value })} placeholder="TM2099-00" />
        </label>
        <label className="field">
          Date<input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
        </label>
        <label className="field">
          Estimator<input value={draft.estimator} onChange={(e) => setDraft({ ...draft, estimator: e.target.value })} />
        </label>
        <label className="field">
          Template workbook (price list and budget structure)
          <select value={draft.templateWorkbook || templates[0]?.workbook || ''} onChange={(e) => setDraft({ ...draft, templateWorkbook: e.target.value })}>
            {templates.map((t) => (
              <option key={t.workbook} value={t.workbook}>
                {t.offerNo ?? t.workbook} — {t.projectName} ({t.client})
              </option>
            ))}
          </select>
        </label>
      </div>
      {tpl && (
        <div className="small muted">
          {tpl.offerNo}: client {tpl.client}, {tpl.itemCount} historical items, {tpl.analysisSheetCount} analysis sheets, price list and budget of this workbook are used for computed costs and for the optional Excel export.
        </div>
      )}
      <div className="row">
        <button className="primary" type="submit" disabled={busy || !draft.name.trim() || !draft.reference.trim()}>
          {busy ? '…' : (submitLabel ?? (quotation ? 'Save' : 'Create quotation'))}
        </button>
        <span className="muted small">The reference becomes the offer number (and the Excel file name).</span>
      </div>
    </form>
  );
}
