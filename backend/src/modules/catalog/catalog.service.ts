import { Injectable, Logger, NotFoundException, OnModuleInit, Optional } from '@nestjs/common';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Catalog, CatalogFacets, CatalogRecord, EmbeddingIndex, EmbeddingStatus, SearchHit, SearchOptions, SearchResult, WorkbookSummary } from '../../common/interfaces/catalog.interface';
import { CATALOG_FILE, EMBEDDINGS_FILE } from '../../common/utils/paths';
import { PrismaService } from '../prisma/prisma.service';
import { buildEmbeddingIndex, embed, embeddingFingerprint, EMBEDDING_MODEL } from './embeddings';
import { parseQuery, rankHybrid, similarRecords } from './catalog-search';
import { fromReferenceTab, syncReferenceTabs } from './reference-tab.mapper';

export type CatalogSource = 'database' | 'json' | 'none';

/**
 * Holds the reference tabs (historical analyses) in memory for search. They are loaded
 * from the ReferenceTab table when it is populated (`npm run extract` syncs it), otherwise
 * from the JSON index files. Workbook summaries always come from the JSON catalog.
 */
@Injectable()
export class CatalogService implements OnModuleInit {
  private readonly log = new Logger(CatalogService.name);
  private catalog: Catalog = { generatedAt: '', workbooks: [], records: [] };
  private byId = new Map<string, CatalogRecord>();
  private readonly vectors = new Map<string, number[]>();
  private embeddingsJob: Promise<void> | null = null;
  source: CatalogSource = 'none';
  embeddingStatus: EmbeddingStatus = 'missing';
  embeddingError: string | null = null;

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.load();
  }

  async load(catalogFile: string = CATALOG_FILE, embeddingsFile: string = EMBEDDINGS_FILE): Promise<void> {
    if (!existsSync(catalogFile)) {
      this.log.warn(`Catalog not found at ${catalogFile}. Run "npm run extract" in backend/.`);
      return;
    }
    this.catalog = JSON.parse(readFileSync(catalogFile, 'utf8')) as Catalog;
    this.vectors.clear();
    this.embeddingStatus = 'missing';
    const expected = embeddingFingerprint(this.catalog.records);

    // 1. database (reference tabs stored with their vectors)
    if (this.prisma) {
      try {
        const rows = await this.prisma.referenceTab.findMany();
        if (rows.length) {
          const records = rows.map(fromReferenceTab);
          const sameSet = records.length === this.catalog.records.length && records.every((r) => this.catalog.records.some((c) => c.id === r.id));
          if (sameSet) {
            this.catalog = { ...this.catalog, records };
            this.source = 'database';
            const withVec = rows.filter((r) => r.embedding.length && r.embeddingModel === EMBEDDING_MODEL && r.fingerprint === expected);
            if (withVec.length === rows.length) {
              for (const r of rows) this.vectors.set(r.id, r.embedding);
              this.embeddingStatus = 'ready';
            }
          } else this.log.warn(`ReferenceTab table (${rows.length}) differs from the catalog JSON (${this.catalog.records.length}); using JSON, run "npm run extract" to resync`);
        }
      } catch (e) {
        this.log.warn(`ReferenceTab table not readable (${e instanceof Error ? e.message : String(e)}); using JSON`);
      }
    }
    if (this.source !== 'database') this.source = 'json';
    this.byId = new Map(this.catalog.records.map((r) => [r.id, r]));

    // 2. JSON embedding index
    if (this.embeddingStatus !== 'ready' && existsSync(embeddingsFile)) {
      const idx = JSON.parse(readFileSync(embeddingsFile, 'utf8')) as EmbeddingIndex;
      const fresh =
        idx.model === EMBEDDING_MODEL &&
        idx.fingerprint === expected &&
        idx.ids.length === this.catalog.records.length &&
        idx.vectors.length === idx.ids.length &&
        idx.vectors.every((v) => v.length === idx.dim && v.every(Number.isFinite));
      if (fresh) {
        idx.ids.forEach((id, i) => this.vectors.set(id, idx.vectors[i]));
        this.embeddingStatus = 'ready';
      } else this.log.warn('Embedding index is stale or corrupt (model, content or vectors changed); rebuilding in background');
    }
    if (this.embeddingStatus !== 'ready') void this.ensureEmbeddings(embeddingsFile);
    this.log.log(`Catalog loaded from ${this.source}: ${this.catalog.records.length} reference tabs, ${this.catalog.workbooks.length} workbooks (embeddings: ${this.embeddingStatus})`);
  }

  ensureEmbeddings(embeddingsFile: string = EMBEDDINGS_FILE): Promise<void> {
    if (this.embeddingStatus === 'ready') return Promise.resolve();
    this.embeddingsJob ??= (async (): Promise<void> => {
      this.embeddingStatus = 'building';
      try {
        const idx = await buildEmbeddingIndex(this.catalog.records);
        idx.ids.forEach((id, i) => this.vectors.set(id, idx.vectors[i]));
        writeFileSync(embeddingsFile, JSON.stringify(idx));
        if (this.prisma) {
          try {
            await syncReferenceTabs(this.prisma, this.catalog, idx);
            this.source = 'database';
          } catch (e) {
            this.log.warn(`Could not store reference tabs in the database: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        this.embeddingStatus = 'ready';
        this.log.log(`Embeddings ready (${idx.ids.length} x ${idx.dim}, ${idx.model})`);
      } catch (e) {
        this.embeddingStatus = 'failed';
        this.embeddingError = e instanceof Error ? e.message : String(e);
        this.log.error(`Embeddings failed, lexical search only: ${this.embeddingError}`);
      } finally {
        this.embeddingsJob = null;
      }
    })();
    return this.embeddingsJob;
  }

  get records(): CatalogRecord[] {
    return this.catalog.records;
  }

  get workbooks(): WorkbookSummary[] {
    return this.catalog.workbooks;
  }

  get(id: string): CatalogRecord {
    const r = this.byId.get(id);
    if (!r) throw new NotFoundException(`Reference tab ${id} not found`);
    return r;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  facets(): CatalogFacets {
    const categories = new Map<string, number>();
    const units = new Map<string, number>();
    for (const r of this.catalog.records) {
      if (r.categoryName) categories.set(r.categoryName, (categories.get(r.categoryName) ?? 0) + 1);
      if (r.unit) units.set(r.unit, (units.get(r.unit) ?? 0) + 1);
    }
    return {
      generatedAt: this.catalog.generatedAt,
      recordCount: this.catalog.records.length,
      source: this.source,
      embeddings: { status: this.embeddingStatus, model: EMBEDDING_MODEL, error: this.embeddingError },
      workbooks: this.catalog.workbooks,
      categories: [...categories].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      units: [...units].map(([name, count]) => ({ name, count })),
    };
  }

  private filter(opts: SearchOptions): CatalogRecord[] {
    return this.catalog.records.filter(
      (r) => (!opts.workbook || r.workbook === opts.workbook || r.offerNo === opts.workbook) && (!opts.category || r.categoryName === opts.category),
    );
  }

  /**
   * Hybrid search. While the embedding index is still building (cold start: model download +
   * 589 texts) the request is answered lexically right away instead of blocking; the response
   * carries `embeddingStatus` so the UI can say so.
   */
  async search(opts: SearchOptions): Promise<SearchResult> {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 200);
    const pool = this.filter(opts);
    const q = (opts.q ?? '').trim();
    if (!q) {
      const hits: SearchHit[] = pool.slice(0, limit).map((record) => ({ record, score: 0, semanticScore: null, lexicalScore: 0, matchedTokens: [] }));
      return { hits, semantic: false, embeddingStatus: this.embeddingStatus };
    }
    let qv: number[] | null = null;
    if (!opts.noSemantic && this.embeddingStatus === 'ready') {
      try {
        qv = (await embed([q]))[0];
      } catch (e) {
        this.log.warn(`Query embedding failed, lexical fallback: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else if (!opts.noSemantic && this.embeddingStatus !== 'failed') void this.ensureEmbeddings();
    return { hits: rankHybrid(pool, parseQuery(q), qv, (id) => this.vectors.get(id), limit), semantic: qv !== null, embeddingStatus: this.embeddingStatus };
  }

  async similar(id: string, limit = 8): Promise<SearchHit[]> {
    const target = this.get(id);
    if (this.embeddingStatus !== 'ready' && this.embeddingStatus !== 'failed') void this.ensureEmbeddings();
    return similarRecords(target, this.catalog.records, (rid) => this.vectors.get(rid), Math.min(Math.max(limit, 1), 50));
  }
}
