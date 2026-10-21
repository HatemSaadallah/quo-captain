/**
 * Hybrid product search: semantic (embeddings) + lexical (tokens, dimensions).
 * Pure functions so they are testable without Nest.
 */
import type { CatalogRecord, SearchHit } from '../../common/interfaces/catalog.interface';
import { normalizeText } from '../../excel/catalog-extractor';
import { dot } from './embeddings';

export interface ParsedQuery {
  tokens: string[];
  dims: Array<[number, number]>;
}

export interface LexicalMatch {
  score: number;
  matched: string[];
}

export type VectorLookup = (id: string) => number[] | undefined;

export function parseQuery(q: string): ParsedQuery {
  const norm = normalizeText(q);
  const dims: Array<[number, number]> = [];
  const tokens: string[] = [];
  for (const tok of norm.split(/\s+/).filter(Boolean)) {
    const m = /^(\d{2,5})x(\d{2,5})$/.exec(tok);
    if (m) {
      dims.push([Number(m[1]), Number(m[2])]);
      tokens.push(tok, m[1], m[2]);
    } else tokens.push(tok);
  }
  return { tokens: [...new Set(tokens)], dims };
}

const tokenMatches = (q: string, t: string): boolean =>
  q === t || (q.length >= 3 && t.startsWith(q)) || (t.length >= 4 && q.startsWith(t) && q.length - t.length <= 6);

/** 0..1: share of query tokens found (prefix match) with a bonus for exact L x H dimension matches. */
export function lexicalScore(r: CatalogRecord, pq: ParsedQuery): LexicalMatch {
  if (!pq.tokens.length) return { score: 0, matched: [] };
  const words = r.searchText.split(' ');
  const matched = pq.tokens.filter((q) => words.some((w) => tokenMatches(q, w)));
  let score = matched.length / pq.tokens.length;
  for (const [a, b] of pq.dims) {
    if ((r.L === a && r.H === b) || (r.L === b && r.H === a)) score = Math.min(1, score + 0.5);
  }
  return { score, matched };
}

export function rankHybrid(records: CatalogRecord[], pq: ParsedQuery, queryVector: number[] | null, vectorOf: VectorLookup, limit: number): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const r of records) {
    const lex = lexicalScore(r, pq);
    const v = queryVector ? vectorOf(r.id) : undefined;
    const sem = queryVector && v ? dot(queryVector, v) : null;
    const score = sem === null ? lex.score : 0.65 * sem + 0.35 * lex.score;
    if (score <= 0) continue;
    hits.push({ record: r, score, semanticScore: sem, lexicalScore: lex.score, matchedTokens: lex.matched });
  }
  hits.sort((a, b) => b.score - a.score || (b.record.offerNo ?? '').localeCompare(a.record.offerNo ?? ''));
  return hits.slice(0, limit);
}

export function similarRecords(target: CatalogRecord, records: CatalogRecord[], vectorOf: VectorLookup, limit: number): SearchHit[] {
  const tv = vectorOf(target.id);
  const hits: SearchHit[] = [];
  for (const r of records) {
    if (r.id === target.id) continue;
    const v = vectorOf(r.id);
    const sem = tv && v ? dot(tv, v) : null;
    // no embeddings: fall back to lexical overlap of the titles
    let score = sem ?? lexicalScore(r, parseQuery(target.title ?? '')).score;
    if (r.categoryName && r.categoryName === target.categoryName) score += 0.03;
    if (r.L && r.H && r.L === target.L && r.H === target.H) score += 0.03;
    if (score <= 0) continue;
    hits.push({ record: r, score, semanticScore: sem, lexicalScore: 0, matchedTokens: [] });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
