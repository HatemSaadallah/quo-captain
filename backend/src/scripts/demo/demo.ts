/**
 * End-to-end demo against a running API: search the catalog, create a project,
 * build a cart (balcony 1600x2560 from TM1643-06 + the TM1823-03 repeat), generate
 * the Excel analysis and print the validation report.
 * Usage: npx tsx src/scripts/demo/demo.ts [apiBase] [email] [password]
 */
import type { CatalogFacets, SearchHit, SearchResult } from '../../common/interfaces/catalog.interface';
import type { GenerationResult } from '../../common/interfaces/generation.interface';
import type { Project, ProjectValidation } from '../../common/interfaces/project.interface';
import type { LoginResponse } from '../../common/interfaces/auth.interface';

const api = process.argv[2] ?? 'http://localhost:3000/api';
const email = process.argv[3] ?? 'estimator@somec.local';
const password = process.argv[4] ?? 'somec2026';
let token = '';

async function call<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
  const res = await fetch(api + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

const eur = (v: number | null | undefined): string => (v === null || v === undefined ? 'n/a' : `${v.toFixed(2)} €`);
const pct = (v: number): string => `${(v * 100).toFixed(0).padStart(3)}%`;

async function main(): Promise<void> {
  console.log('\n0. Login');
  let estimator = 'make demo';
  try {
    const login = await call<LoginResponse>('POST', '/auth/login', { email, password });
    token = login.token;
    estimator = login.user.name;
    console.log(`   ${login.user.name} <${login.user.email}> (${login.user.role})`);
  } catch (e) {
    if (!(e instanceof Error && /-> 404/.test(e.message))) throw e;
    console.log('   no auth endpoint on this API (pre-auth build), continuing without a token');
  }

  console.log('\n1. Catalog');
  const facets = await call<CatalogFacets>('GET', '/catalog/facets');
  console.log(`   ${facets.recordCount} historical analyses from ${facets.workbooks.length} workbooks, embeddings: ${facets.embeddings.status}`);

  console.log('\n2. Search "prefabricated balcony 1600x2560"');
  const search = await call<SearchResult>('GET', '/catalog/search?q=' + encodeURIComponent('prefabricated balcony 1600x2560') + '&limit=5');
  for (const h of search.hits) console.log(`   ${pct(h.score)}  ${h.record.id.padEnd(14)} ${h.record.title}  (${eur(h.record.unitCost)} / ${h.record.unit})`);
  const pick = search.hits.find((h) => h.record.id === 'TM1643-06#10') ?? search.hits[0];

  console.log(`\n3. Similar analyses to ${pick.record.id}`);
  const similar = await call<SearchHit[]>('GET', `/catalog/${encodeURIComponent(pick.record.id)}/similar?limit=4`);
  for (const h of similar) console.log(`   ${pct(h.score)}  ${h.record.id.padEnd(14)} ${h.record.title}`);

  console.log('\n4. Project + cart');
  const ref = 'TM2099-' + String(Date.now() % 100).padStart(2, '0');
  let project = await call<Project>('POST', '/projects', { name: 'Demo - Nave 4 Balcony', customer: 'APEXA', reference: ref, date: new Date().toISOString().slice(0, 10), estimator, templateWorkbook: 'TM1643-06 Analisi.xlsx' });
  project = await call<Project>('POST', `/projects/${project.id}/items`, { catalogId: pick.record.id, quantity: 50 });
  const repeat = similar.find((h) => h.record.id === 'TM1823-03#10');
  if (repeat) project = await call<Project>('POST', `/projects/${project.id}/items`, { catalogId: repeat.record.id, quantity: 5 });
  const first = project.items[0];
  if (first.params.some((p) => p.cell === 'N4')) project = await call<Project>('PATCH', `/projects/${project.id}/items/${first.id}`, { params: [{ cell: 'N4', value: 1700 }] });
  const validation = await call<ProjectValidation>('GET', `/projects/${project.id}/validation`);
  console.log(`   project ${project.id} (${ref}) with ${project.items.length} items, validation ok=${validation.ok}, indicative total ${eur(validation.estimatedTotal)}`);
  for (const i of validation.issues) console.log(`   - [${i.level}] ${i.message}`);

  console.log('\n5. Generate Excel analysis');
  const gen = await call<GenerationResult>('POST', `/projects/${project.id}/generate`);
  const r = gen.report;
  console.log(`   status: ${r.status}  engine: ${r.engine}  recalculated: ${r.recalculation.performed}`);
  console.log(`   ${r.summary}`);
  console.log(`   file:   data/output/${gen.outputFile}`);
  console.log(`   report: data/output/${gen.reportFile}`);
  for (const it of r.items) console.log(`   - ${it.itemCode} -> sheet '${it.sheet}' (ELENCO COSTI row ${it.row}, BOQ row ${it.boqRow}), qty ${it.quantity}, historical ${eur(it.historicalUnitCost)}, recalculated ${eur(it.unitCost)}, missing codes ${it.missingCodes.length}`);
  const levels: Record<string, number> = {};
  for (const c of r.checks) levels[c.level] = (levels[c.level] ?? 0) + 1;
  console.log(`   checks: ${JSON.stringify(levels)}`);
  for (const c of r.checks.filter((c) => c.level !== 'ok')) console.log(`   - [${c.level}] ${c.check}: ${c.detail.slice(0, 160)}`);
  console.log('\nOpen the .xlsx in Excel to recalculate (choose "don\'t update links"), then compare ELENCO COSTI!J with the historical unit costs.\n');
}

main().catch((e: unknown) => {
  console.error('demo failed:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
