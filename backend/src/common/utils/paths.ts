import { existsSync } from 'node:fs';
import path from 'node:path';

/** Repository root: the directory that contains backend/package.json (works from src/ and dist/). */
function findRoot(): string {
  if (process.env.SOMEC_ROOT) return path.resolve(process.env.SOMEC_ROOT);
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(dir, 'backend', 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  return path.resolve(__dirname, '..', '..', '..');
}

export const ROOT_DIR: string = findRoot();
export const DATA_DIR: string = path.join(ROOT_DIR, 'data');
export const INPUT_DIR: string = path.join(DATA_DIR, 'input');
export const PROCESSED_DIR: string = path.join(DATA_DIR, 'processed');
export const OUTPUT_DIR: string = path.join(DATA_DIR, 'output');
export const PROJECTS_DIR: string = path.join(DATA_DIR, 'quotations');
export const MODELS_DIR: string = path.join(DATA_DIR, 'models');
export const CATALOG_FILE: string = path.join(PROCESSED_DIR, 'product_catalog.json');
export const EMBEDDINGS_FILE: string = path.join(PROCESSED_DIR, 'catalog_embeddings.json');
