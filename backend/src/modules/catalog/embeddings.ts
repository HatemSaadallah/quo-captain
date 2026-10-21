/**
 * Local sentence embeddings via transformers.js (ONNX, CPU). No API key; the
 * model is downloaded once into data/models. Multilingual because the sheets
 * mix English product descriptions with Italian labels.
 *
 * transformers.js is ESM-only, so it is loaded with a dynamic import from this
 * CommonJS module.
 */
import { createHash } from 'node:crypto';
import type { FeatureExtractionPipeline } from '@huggingface/transformers' with { 'resolution-mode': 'import' };
import type { CatalogRecord, EmbeddingIndex } from '../../common/interfaces/catalog.interface';
import { MODELS_DIR } from '../../common/utils/paths';

export const EMBEDDING_MODEL: string = process.env.EMBEDDING_MODEL ?? 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

let extractor: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  extractor ??= (async (): Promise<FeatureExtractionPipeline> => {
    const { env, pipeline } = await import('@huggingface/transformers');
    env.cacheDir = MODELS_DIR;
    env.allowLocalModels = false;
    return (await pipeline('feature-extraction', EMBEDDING_MODEL, { dtype: 'q8' })) as FeatureExtractionPipeline;
  })();
  return extractor;
}

/** Mean-pooled, L2-normalised embeddings (so dot product == cosine). */
export async function embed(texts: string[]): Promise<number[][]> {
  const ex = await getExtractor();
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 32) {
    const batch = texts.slice(i, i + 32);
    const t = await ex(batch, { pooling: 'mean', normalize: true });
    out.push(...(t.tolist() as number[][]));
  }
  return out;
}

export function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** The text that represents a catalog record for semantic search (most informative first: the model reads ~128 tokens). */
export function embeddingText(r: CatalogRecord): string {
  const lines = (r.description ?? '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const dims = r.L && r.H ? `${r.L} x ${r.H} mm` : '';
  const params = r.params
    .filter((p) => p.value !== null)
    .map((p) => `${p.label} ${p.value} ${p.unit ?? ''}`.trim())
    .join(', ');
  return [r.title ?? '', r.itemCode ?? '', r.categoryName ?? '', r.unit ?? '', dims, lines.slice(0, 4).join(' '), params]
    .filter(Boolean)
    .join('. ')
    .slice(0, 1200);
}

/** Fingerprint of model + every embedded text, so a re-extraction with changed descriptions invalidates the cache. */
export function embeddingFingerprint(records: CatalogRecord[]): string {
  const h = createHash('sha256');
  h.update(EMBEDDING_MODEL);
  for (const r of records) h.update(`\n${r.id}\t${embeddingText(r)}`);
  return h.digest('hex');
}

export async function buildEmbeddingIndex(records: CatalogRecord[]): Promise<EmbeddingIndex> {
  const vectors = await embed(records.map(embeddingText));
  return { model: EMBEDDING_MODEL, dim: vectors[0]?.length ?? 0, ids: records.map((r) => r.id), vectors, fingerprint: embeddingFingerprint(records) };
}
