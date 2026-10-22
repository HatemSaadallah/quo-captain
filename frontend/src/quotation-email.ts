import { fmtMoney, quotationCost, type Quotation } from './api';

export type EmailTemplate = 'report' | 'prices' | 'followup';
export function quotationEmail(quotation: Quotation, template: EmailTemplate): { subject: string; body: string } {
  const reference = quotation.reference || quotation.name;
  const total = quotationCost(quotation);
  const missing = quotation.items.filter((item) => item.unitCostOverride === null && item.historicalUnitCost === null).length;
  const greeting = `Hello,\n\n`;
  const signature = `\n\nBest regards,\n${quotation.estimator || 'Somec team'}`;
  if (template === 'prices') return { subject: `${reference} · Cost estimate review`, body: greeting + `Please find the latest cost report for ${quotation.name}, ${quotation.projectName}, prepared for ${quotation.customer}.\n\nThe current estimated cost is ${fmtMoney(total)}${missing ? ` (partial: ${missing} items still require costing)` : ''}. These figures are estimated costs, not selling prices.\n\nPlease review the report and let us know if you would like to discuss material assumptions, quantities or revised requirements.\n\n[Attach the downloaded report before sending.]` + signature };
  if (template === 'followup') return { subject: `${reference} · Project follow-up`, body: greeting + `I am following up on ${quotation.name} for ${quotation.projectName}.\n\nHave you had a chance to review the report? Please let us know whether the scope, quantities and cost assumptions reflect your requirements, or if you would like a revised version.\n\nWe would be happy to arrange a short discussion.` + signature };
  return { subject: `${reference} · ${quotation.name} report`, body: greeting + `Please find the report for ${quotation.name}, part of ${quotation.projectName}, prepared for ${quotation.customer}.\n\nReference: ${reference}\nReport date: ${quotation.date}\nScope: ${quotation.items.length} product lines\n\nPlease review the scope and cost breakdown, and let us know if any changes are needed.\n\n[Attach the downloaded report before sending.]` + signature };
}

export function emailDraftUrl(recipients: string[], subject: string, body: string): string {
  return `mailto:${recipients.map((email) => encodeURIComponent(email)).join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
