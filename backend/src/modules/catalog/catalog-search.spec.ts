import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync } from 'node:fs';
import { CATALOG_FILE, EMBEDDINGS_FILE } from '../../common/utils/paths';
import { CatalogService } from './catalog.service';
import { parseQuery, lexicalScore } from './catalog-search';

describe('query parsing', () => {
  it('extracts dimension pairs and tokens', () => {
    const pq = parseQuery('Prefabricated balcony 1600x2560');
    expect(pq.dims).toEqual([[1600, 2560]]);
    expect(pq.tokens).toEqual(expect.arrayContaining(['prefabricated', 'balcony', '1600x2560', '1600', '2560']));
  });
});

describe('catalog search on the extracted catalog', () => {
  const svc = new CatalogService();
  beforeAll(async () => {
    expect(existsSync(CATALOG_FILE), 'run npm run extract first').toBe(true);
    svc.load(CATALOG_FILE, EMBEDDINGS_FILE);
    await svc.ensureEmbeddings(EMBEDDINGS_FILE);
  });

  it('lexical search finds the balcony by description and dimensions', async () => {
    const { hits } = await svc.search({ q: 'prefabricated balcony 1600x2560', noSemantic: true, limit: 10 });
    const ids = hits.map((h) => h.record.id);
    expect(ids).toContain('TM1643-06#10');
    expect(ids).toContain('TM1823-03#10');
    expect(hits[0].record.L).toBe(2560);
    expect(hits[0].record.H).toBe(1600);
  });

  it('semantic search is not exact: "prefabricated balcony" ranks PRE-FAB BALCONY sheets first', async () => {
    const { hits, semantic } = await svc.search({ q: 'prefabricated balcony 1600x2560', limit: 10 });
    expect(semantic).toBe(true);
    expect(hits[0].record.categoryName).toBe('PRE-FAB BALCONIES');
    expect(hits.slice(0, 5).map((h) => h.record.id)).toEqual(expect.arrayContaining(['TM1643-06#10', 'TM1823-03#10']));
    expect(hits[0].semanticScore).toBeGreaterThan(0.3);
  });

  it('semantic search survives wording that never appears in the sheets', async () => {
    const { hits } = await svc.search({ q: 'glass railing for cabin balcony', limit: 10 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => /BALUSTRADE|RAILING|PARAPET/i.test(h.record.categoryName ?? h.record.title ?? ''))).toBe(true);
  });

  it('suggests similar products for a selected analysis', async () => {
    const sim = await svc.similar('TM1643-06#10', 6);
    expect(sim.length).toBe(6);
    expect(sim[0].record.id).not.toBe('TM1643-06#10');
    expect(sim.map((h) => h.record.id)).toContain('TM1823-03#10');
    expect(sim.every((h) => h.score > 0.5)).toBe(true);
  });

  it('lexical scoring rewards exact dimension matches', () => {
    const r = svc.get('TM1643-06#10');
    expect(lexicalScore(r, parseQuery('balcony 2560x1600')).score).toBeGreaterThan(lexicalScore(r, parseQuery('balcony 1000x1000')).score);
  });
});
