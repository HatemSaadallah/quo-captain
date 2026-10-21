import { useEffect, useState } from 'react';
import { api, type ProjectContact, type Quotation } from '../api';
import { emailDraftUrl, quotationEmail, type EmailTemplate } from '../quotation-email';
import '../report-email.css';

export function ReportEmailModal({ quotation, reportName, onClose }: { quotation: Quotation; reportName?: string; onClose: () => void }) {
  const [contacts, setContacts] = useState<ProjectContact[]>([]);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [template, setTemplate] = useState<EmailTemplate>('report');
  const initial = quotationEmail(quotation, 'report');
  const [subject, setSubject] = useState(initial.subject); const [body, setBody] = useState(initial.body);
  const [allContacts, setAllContacts] = useState(false); const [error, setError] = useState('');
  const [loading, setLoading] = useState(true); const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    api.projectContacts().then((result) => { if (live) { setContacts(result); setRecipients(result.filter((contact) => contact.company === quotation.customer).map((contact) => contact.email)); } }).catch((reason: unknown) => { if (live) setError(reason instanceof Error ? reason.message : String(reason)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [quotation.customer]);
  const chooseTemplate = (value: EmailTemplate): void => { const next = quotationEmail(quotation, value); setTemplate(value); setSubject(next.subject); setBody(next.body); setCopied(false); };
  const visible = contacts.filter((contact) => allContacts || contact.company === quotation.customer);
  return <div className="modal-backdrop" role="presentation"><section className="panel report-email-modal" role="dialog" aria-modal="true" aria-labelledby="report-email-title">
    <header><div><span className="email-overline">Share a report</span><h2 id="report-email-title">Update your contacts</h2><p>{quotation.customer} · {quotation.reference}</p></div><button type="button" onClick={onClose} aria-label="Close email draft">×</button></header>
    {reportName && <div className="email-report-ready">✓ Report downloaded <strong>{reportName.split('/').pop()}</strong></div>}
    {error && <div className="error-box" role="alert">{error}</div>}
    <div className="email-compose-layout"><aside><div className="email-recipient-heading"><strong>Recipients</strong><span>{recipients.length} selected</span></div><label className="email-all-contacts"><input type="checkbox" checked={allContacts} onChange={(event) => setAllContacts(event.target.checked)} />Show all directory contacts</label>{loading && <p className="small muted">Loading contacts…</p>}<div className="email-recipients">{visible.map((contact) => <label key={contact.id}><input type="checkbox" checked={recipients.includes(contact.email)} onChange={(event) => setRecipients((current) => event.target.checked ? [...current, contact.email] : current.filter((email) => email !== contact.email))} /><span><strong>{contact.name}</strong><small>{contact.company} · {contact.role}</small><span>{contact.email}</span></span></label>)}</div>{!loading && !visible.length && <p className="small muted">No contacts linked to this customer. Enable all directory contacts to select recipients.</p>}</aside>
    <div className="email-editor"><label className="field">Email template<select aria-label="Email template" value={template} onChange={(event) => chooseTemplate(event.target.value as EmailTemplate)}><option value="report">Report sharing</option><option value="prices">Cost / price update</option><option value="followup">Project follow-up</option></select></label><label className="field">Subject<input value={subject} maxLength={300} onChange={(event) => setSubject(event.target.value)} /></label><label className="field">Message<textarea rows={13} value={body} maxLength={10000} onChange={(event) => { setBody(event.target.value); setCopied(false); }} /></label></div></div>
    <footer><p>Opens a draft in your mail app. Attach the downloaded report there before sending. Nothing is sent automatically.</p><div><button type="button" onClick={onClose}>Close</button><button type="button" onClick={() => { void navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`).then(() => setCopied(true)).catch(() => setError('Could not copy. Select and copy the message text instead.')); }}>{copied ? 'Copied ✓' : 'Copy email text'}</button><a className={`email-open-draft ${!recipients.length || !subject.trim() || !body.trim() ? 'disabled' : ''}`} aria-disabled={!recipients.length || !subject.trim() || !body.trim()} href={recipients.length && subject.trim() && body.trim() ? emailDraftUrl(recipients, subject, body) : undefined}>Open email draft ↗</a></div></footer>
  </section></div>;
}
