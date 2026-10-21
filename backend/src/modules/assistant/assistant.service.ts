import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { AuthUser } from '../../common/interfaces/auth.interface';
import { CatalogService } from '../catalog/catalog.service';
import { QuotationsService } from '../quotations/quotations.service';
import { GenerationService } from '../generation/generation.service';

export interface AssistantMessage { role: 'user' | 'assistant'; content: string }
type ToolCall = { id: string; function: { name: string; arguments: string } };
type ChatMessage = AssistantMessage | { role: 'system'; content: string } | { role: 'tool'; tool_call_id: string; content: string } | { role: 'assistant'; content: string | null; tool_calls: ToolCall[] };

const tools = [
  { type: 'function', function: { name: 'search_catalog', description: 'Find historical and custom products by natural language.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false }, strict: true } },
  { type: 'function', function: { name: 'search_quotations', description: 'Search the signed-in user’s quotations and line items.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false }, strict: true } },
  { type: 'function', function: { name: 'search_workbooks', description: 'Find source workbooks and project summaries.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false }, strict: true } },
  { type: 'function', function: { name: 'search_generated_files', description: 'Find generated quotation files belonging to the signed-in user.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false }, strict: true } },
  { type: 'function', function: { name: 'search_contacts', description: 'Search the workspace contact directory.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false }, strict: true } },
  { type: 'function', function: { name: 'create_catalog_product', description: 'Create a reusable catalog product after the user clearly asks to create one and all required fields are known. Product embeddings are generated before returning.', parameters: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, categoryName: { type: 'string' }, unit: { type: 'string' }, itemCode: { type: ['string', 'null'] }, L: { type: ['number', 'null'] }, H: { type: ['number', 'null'] } }, required: ['title', 'description', 'categoryName', 'unit', 'itemCode', 'L', 'H'], additionalProperties: false }, strict: true } },
];

@Injectable()
export class AssistantService {
  constructor(private readonly catalog: CatalogService, private readonly quotations: QuotationsService, private readonly generation: GenerationService) {}

  async chat(history: AssistantMessage[], user: AuthUser, contacts: Array<Record<string, unknown>> = []): Promise<{ reply: string }> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new ServiceUnavailableException('Assistant is not configured. Set OPENAI_API_KEY in the backend environment.');
    const messages: ChatMessage[] = [
      { role: 'system', content: `You are Somec's workspace assistant. Help users search the whole workspace: product catalog, their quotations and line items, project workbooks, their generated files, and custom catalog creation. Use the provided tools for data questions and never invent records or prices. State when a search has no result. Historical costs are estimates, not selling prices. Create a product only after a clear request and when required product name, description, category, and unit are known; ask a concise follow-up for any missing fields. Custom products have no historical unit cost. Respond concisely and distinguish facts from suggestions. Current user: ${user.name}.` },
      ...history.filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-12),
    ];
    for (let turn = 0; turn < 5; turn++) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini', messages, tools, tool_choice: 'auto', temperature: 0.2 }) });
      if (!response.ok) {
        if (response.status === 401) throw new ServiceUnavailableException('OpenAI rejected the configured API key. Check OPENAI_API_KEY.');
        if (response.status === 429) throw new ServiceUnavailableException('OpenAI returned 429. Check API credits/billing and rate limits.');
        throw new ServiceUnavailableException(`Assistant provider returned ${response.status}`);
      }
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] } }> };
      const assistantMessage = payload.choices?.[0]?.message;
      if (!assistantMessage) throw new ServiceUnavailableException('Assistant returned an empty response');
      if (!assistantMessage.tool_calls?.length) return { reply: assistantMessage.content ?? 'I could not form a response.' };
      messages.push({ role: 'assistant', content: assistantMessage.content ?? null, tool_calls: assistantMessage.tool_calls });
      for (const call of assistantMessage.tool_calls) {
        let result: unknown;
        try { result = await this.runTool(call.function.name, JSON.parse(call.function.arguments) as Record<string, unknown>, user, contacts); }
        catch (e) { result = { error: e instanceof Error ? e.message : String(e) }; }
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
    return { reply: 'I reached the search/action limit for this turn. Please narrow the request.' };
  }

  private async runTool(name: string, args: Record<string, unknown>, user: AuthUser, contacts: Array<Record<string, unknown>>): Promise<unknown> {
    const query = typeof args.query === 'string' ? args.query : '';
    if (name === 'search_catalog') {
      const result = await this.catalog.search({ q: query, limit: 8 });
      return result.hits.map(({ record: r }) => ({ id: r.id, title: r.title, description: r.description, category: r.categoryName, itemCode: r.itemCode, unit: r.unit, historicalUnitCost: r.unitCost, custom: r.custom, source: r.custom ? 'Custom catalog' : `${r.workbook} · ${r.sheet}` }));
    }
    if (name === 'search_quotations') {
      const all = await this.quotations.list(user.id);
      const words = query.toLocaleLowerCase().split(/\s+/).filter((word) => word.length > 2);
      return all.map((q) => ({ q, text: [q.name, q.customer, q.reference, ...q.items.map((i) => `${i.description} ${i.itemCode}`)].join(' ').toLocaleLowerCase() }))
        .map(({ q, text }) => ({ q, score: words.filter((word) => text.includes(word)).length })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 8)
        .map(({ q }) => ({ id: q.id, name: q.name, customer: q.customer, reference: q.reference, status: q.status, items: q.items.map((i) => ({ description: i.description, itemCode: i.itemCode, quantity: i.quantity, unit: i.unit, unitCost: i.unitCostOverride ?? i.historicalUnitCost })) }));
    }
    if (name === 'search_workbooks') {
      const words = query.toLocaleLowerCase().split(/\s+/).filter((word) => word.length > 2);
      return this.catalog.workbooks.map((w) => ({ w, text: Object.values(w).join(' ').toLocaleLowerCase() }))
        .map(({ w, text }) => ({ w, score: words.filter((word) => text.includes(word)).length })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 8).map((x) => x.w);
    }
    if (name === 'search_generated_files') {
      const files = await this.generation.listOutputs(user.id);
      const words = query.toLocaleLowerCase().split(/\s+/).filter((word) => word.length > 2);
      return files.map((file) => ({ file, text: `${file.folder} ${file.file}`.toLocaleLowerCase() }))
        .map(({ file, text }) => ({ file, score: words.filter((word) => text.includes(word)).length })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 8).map((x) => x.file);
    }
    if (name === 'search_contacts') {
      const words = query.toLocaleLowerCase().split(/\s+/).filter((word) => word.length > 2);
      return contacts.map((contact) => ({ contact, text: Object.values(contact).flatMap((v) => Array.isArray(v) ? v : [v]).join(' ').toLocaleLowerCase() }))
        .map(({ contact, text }) => ({ contact, score: words.filter((word) => text.includes(word)).length })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 8).map((x) => x.contact);
    }
    if (name === 'create_catalog_product') {
      const text = (key: string): string => typeof args[key] === 'string' ? String(args[key]).trim() : '';
      const num = (key: string): number | null => typeof args[key] === 'number' ? Number(args[key]) : null;
      const product = await this.catalog.createProduct({ title: text('title'), description: text('description'), categoryName: text('categoryName'), unit: text('unit'), itemCode: text('itemCode') || undefined, L: num('L'), H: num('H') }, user.id);
      return { id: product.id, title: product.title, embedded: true, message: 'Created and embedded locally; no historical cost is recorded.' };
    }
    return { error: 'Unknown tool' };
  }
}
