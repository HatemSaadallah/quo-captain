/**
 * Index every workbook in data/input into data/processed/product_catalog.json
 * and precompute the embedding index (data/processed/catalog_embeddings.json).
 * Usage: npm run extract            (catalog + embeddings)
 *        npm run extract -- --no-embeddings
 */
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CATALOG_FILE, EMBEDDINGS_FILE, INPUT_DIR, PROCESSED_DIR } from '../../common/utils/paths';
import { buildCatalog } from '../../excel/catalog-extractor';
import { buildEmbeddingIndex } from '../../modules/catalog/embeddings';

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

  if (!process.argv.includes('--no-embeddings')) {
    const t1 = Date.now();
    const idx = await buildEmbeddingIndex(catalog.records);
    writeFileSync(EMBEDDINGS_FILE, JSON.stringify(idx));
    console.log(`${idx.ids.length} embeddings x ${idx.dim} (${idx.model}) -> ${EMBEDDINGS_FILE} in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  }
}

void main();
