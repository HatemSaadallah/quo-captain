import { Logger } from '@nestjs/common';

const usageLog = new Logger('LLM usage');

/**
 * Chat-completions provider for the assistant and project intelligence.
 * GROK_API_KEY (or GROQ_API_KEY) wins over OPENAI_API_KEY. The provider is detected from the key:
 * `gsk_…` is Groq (api.groq.com), `xai-…` is xAI Grok (api.x.ai). All three speak the OpenAI chat format.
 */
export interface LlmProvider {
  name: 'groq' | 'xai' | 'openai';
  label: string;
  url: string;
  key: string;
  model: string;
  /** Extra request fields only this provider accepts. */
  extra: Record<string, unknown>;
}

export function llmProvider(): LlmProvider | null {
  const grok = (process.env.GROK_API_KEY ?? process.env.GROQ_API_KEY ?? '').trim();
  if (grok.startsWith('gsk_')) {
    return { name: 'groq', label: 'Groq', url: 'https://api.groq.com/openai/v1/chat/completions', key: grok, model: process.env.GROK_MODEL ?? process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b', extra: { reasoning_effort: process.env.LLM_REASONING ?? 'medium', max_completion_tokens: 1400 } };
  }
  if (grok) {
    return { name: 'xai', label: 'xAI Grok', url: 'https://api.x.ai/v1/chat/completions', key: grok, model: process.env.GROK_MODEL ?? 'grok-3-mini', extra: { reasoning_effort: 'low', max_tokens: 900 } };
  }
  const openai = (process.env.OPENAI_API_KEY ?? '').trim();
  if (openai) return { name: 'openai', label: 'OpenAI', url: 'https://api.openai.com/v1/chat/completions', key: openai, model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini', extra: { store: false, max_tokens: 900 } };
  return null;
}

/** POST a chat-completions body to the configured provider. Throws a readable Error on HTTP failure. */
export async function chatCompletion(provider: LlmProvider, body: Record<string, unknown>, timeoutMs = 45_000, retried = false): Promise<{ choices?: Array<{ message?: { content?: string | null; refusal?: string; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }> }> {
  const response = await fetch(provider.url, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { authorization: `Bearer ${provider.key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: provider.model, ...provider.extra, ...body }),
  });
  if (response.status === 429 && !retried) {
    // Free tiers meter tokens per minute; wait out a short reset once instead of failing the request.
    const wait = Number(response.headers.get('retry-after') ?? '0');
    if (wait > 0 && wait <= 12) {
      await new Promise((r) => setTimeout(r, wait * 1000));
      return chatCompletion(provider, body, timeoutMs, true);
    }
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    if (response.status === 401) throw new Error(`${provider.label} rejected the configured API key.`);
    if (response.status === 429) throw new Error(`${provider.label} rate limit reached. Please try again in a moment.`);
    throw new Error(`${provider.label} returned ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  const json = (await response.json()) as Awaited<ReturnType<typeof chatCompletion>> & { usage?: { prompt_tokens?: number; completion_tokens?: number } };
  if (json.usage) usageLog.log(`${provider.name} ${provider.model}: ${json.usage.prompt_tokens ?? '?'} in + ${json.usage.completion_tokens ?? '?'} out tokens`);
  return json;
}
