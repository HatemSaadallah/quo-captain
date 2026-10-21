/**
 * Index every workbook in data/input into data/processed/product_catalog.json,
 * precompute the embedding index (data/processed/catalog_embeddings.json) and
 * store the reference tabs with their vectors in the ReferenceTab table.
 * Usage: npm run extract            (catalog + embeddings + database sync)
 *        npm run extract -- --no-embeddings
 *        npm run extract -- --no-db
 */
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import type { EmbeddingIndex } from '../../common/interfaces/catalog.interface';
import { CATALOG_FILE, EMBEDDINGS_FILE, INPUT_DIR, PROCESSED_DIR } from '../../common/utils/paths';
import { buildCatalog } from '../../excel/catalog-extractor';
import { buildEmbeddingIndex } from '../../modules/catalog/embeddings';
import { syncReferenceTabs } from '../../modules/catalog/reference-tab.mapper';

async function main(): Promise<void> {
  const files = readdirSync(INPUT_DIR)
    .filter((f) => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'))
    .sort()
    .map((f) => path.join(INPUT_DIR, f));

  const t0 = Date.now();
  const catalog = await buildCatalog(files);
  mkdirSync(PROCESSED_DIR, { recursive: true });
  writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 1));
  for (const w of catalog.workbooks) {
    console.log(`${w.workbook}: ${w.itemCount} items, ${w.analysisSheetCount} analysis sheets, ${w.freeItemRows} free rows, total cost ${w.totalCost?.toFixed(2)}`);
  }
  const withSheet = catalog.records.filter((r) => r.sheet).length;
  const warned = catalog.records.filter((r) => r.warnings.length).length;
  console.log(`${catalog.records.length} records (${withSheet} with analysis sheet, ${warned} with warnings) -> ${CATALOG_FILE} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  let index: EmbeddingIndex | null = null;
  if (!process.argv.includes('--no-embeddings')) {
    const t1 = Date.now();
    index = await buildEmbeddingIndex(catalog.records);
    writeFileSync(EMBEDDINGS_FILE, JSON.stringify(index));
    console.log(`${index.ids.length} embeddings x ${index.dim} (${index.model}) -> ${EMBEDDINGS_FILE} in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  }

  if (!process.argv.includes('--no-db')) {
    const prisma = new PrismaClient();
    try {
      const t2 = Date.now();
      const n = await syncReferenceTabs(prisma, catalog, index);
      console.log(`${n} reference tabs stored in the database (ReferenceTab) in ${((Date.now() - t2) / 1000).toFixed(1)}s`);
    } catch (e) {
      console.warn(`database sync skipped: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      await prisma.$disconnect();
    }
  }
}

void main();
