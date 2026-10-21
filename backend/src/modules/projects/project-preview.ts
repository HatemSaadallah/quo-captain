import type { Project } from '../../common/interfaces/project.interface';

export const normalizeProjectQuery = (value: string): string => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/jacc?uzz?i|hot[ -]?tub/g, 'jacuzzi').replace(/balconies/g, 'balcony').replace(/glazing|vetro/g, 'glass');
const ignored = new Set('the a an i we our want need same project projects find look for from with without last latest previous time did do this that me show please company customer worked on of in and but it its to what which was were is as give again us quotation quotations summarize summary everything all item items product products component components related associated line lines'.split(' '));
const words = (value: string): string[] => [...new Set(normalizeProjectQuery(value).match(/[a-z0-9]+/g) ?? [])].filter((word) => word.length > 1 && !ignored.has(word));

/** Explicit MVP preview: deterministic matching over real records, never simulated model output. */
export function previewSearch(query: string, projects: Project[]): { reply: string; projectIds: string[] } {
  const terms = words(query);
  const customerMatches = projects.filter((project) => normalizeProjectQuery(query).includes(normalizeProjectQuery(project.customer)));
  const pool = customerMatches.length ? customerMatches : projects;
  const topicTerms = customerMatches.length ? terms.filter((term) => !customerMatches.some((project) => normalizeProjectQuery(project.customer).includes(term))) : terms;
  const scores = pool.map((project) => {
    const name = normalizeProjectQuery(project.name);
    const text = normalizeProjectQuery([project.name, project.customer, project.brief ?? '', ...project.quotations.flatMap((q) => [q.reference, q.name, ...q.items.map((item) => item.description)])].join(' '));
    return { project, score: terms.filter((term) => text.includes(term)).length + (name && normalizeProjectQuery(query).includes(name) ? 8 : 0), latest: project.quotations.map((q) => q.date).sort().at(-1) ?? project.updatedAt };
  }).filter((entry) => topicTerms.length ? topicTerms.some((term) => normalizeProjectQuery([entry.project.name, entry.project.brief ?? '', ...entry.project.quotations.flatMap((q) => [q.reference, q.name, ...q.items.map((item) => item.description)])].join(' ')).includes(term)) : entry.score > 0 || customerMatches.length > 0);
  const recent = /last|latest|recent|previous/i.test(query);
  scores.sort((a, b) => recent ? b.latest.localeCompare(a.latest) || b.score - a.score : b.score - a.score || b.latest.localeCompare(a.latest));
  const selected = scores.slice(0, recent ? 3 : 8);
  return { reply: selected.length ? `Found ${selected.length} projects${recent ? ', most recent first' : ''} matching your request. Open one to see its brief, quotations and conversation.` : 'No matching project found. Try a customer name, project reference, balcony, glass or jacuzzi.', projectIds: selected.map((entry) => entry.project.id) };
}

export function previewChat(request: string, activeId: string, projects: Project[]): { reply: string; sourceQuotationId: string | null; excludeItemIds: string[]; title: string } {
  const active = projects.find((project) => project.id === activeId)!;
  const plain = normalizeProjectQuery(request);
  const base = { sourceQuotationId: null, excludeItemIds: [], title: '' };
  const quotations = projects.flatMap((project) => project.quotations).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
  const named = quotations.filter((quotation) => quotation.reference && plain.includes(quotation.reference.toLowerCase()));
  const source = named[0] ?? [...active.quotations].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt))[0] ?? quotations[0];
  const removal = /\b(without|except|exclude|remove|omit|senza)\b/.test(plain);
  const duplicate = /\b(same|copy|duplicate|reuse|repeat|new draft)\b/.test(plain);
  if ((removal || duplicate) && source) {
    const targets = removal ? words(plain.split(/\b(?:without|except|exclude|remove|omit|senza)\b/).slice(1).join(' ')) : [];
    if (removal && !targets.length) return { ...base, reply: 'Which items should the new draft exclude? You can use an item description, such as “without the jacuzzi windscreen”.' };
    const excluded = source.items.filter((item) => targets.some((term) => normalizeProjectQuery(item.description).includes(term)));
    if (removal && !excluded.length) return { ...base, reply: `I could not find “${targets.join(' ')}” in ${source.reference}. No revision proposed. Tell me the quotation reference or exact item to exclude.` };
    if (excluded.length === source.items.length) return { ...base, reply: `That would remove every item in ${source.reference}. Which items should we keep?` };
    return { reply: `Using ${source.reference} (${source.name}) for ${active.customer}. The proposed draft keeps ${source.items.length - excluded.length} items${excluded.length ? ` and excludes ${excluded.length} matching ${excluded.length === 1 ? 'item' : 'items'}` : ''}. Review the exact list before creating it.`, sourceQuotationId: source.id, excludeItemIds: excluded.map((item) => item.id), title: `${source.name}${targets.length ? ` — without ${targets.join(' ')}` : ' — revised draft'}` };
  }
  if (/previous|last time|last quote|history/.test(plain)) return { ...base, reply: quotations.length ? `Recent quotations for ${active.customer}:\n${quotations.slice(0, 4).map((quotation) => `${quotation.reference} · ${quotation.name} · ${quotation.date} · ${quotation.items.length} items`).join('\n')}\nSpecify a reference to reuse it.` : 'There are no previous quotations for this customer yet.' };
  return { ...base, reply: `${active.name} · ${active.customer}\n${active.quotations.length} quotations, ${active.quotations.reduce((count, q) => count + q.items.length, 0)} line items and ${active.contacts.length} contacts.${active.brief ? `\nSaved brief: ${active.brief.slice(0, 1200)}` : '\nNo project brief or meeting transcript has been added yet.'}\nYou can ask for a copy of a quotation, exclude items by description, or add context in Brief & transcript.` };
}
