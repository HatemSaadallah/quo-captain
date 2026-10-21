#!/usr/bin/env node
/**
 * End-to-end demo against a running API: search the catalog, create a project,
 * build a cart (balcony 1600x2560 from TM1643-06 + the TM1823-03 repeat), generate
 * the Excel analysis and print the validation report. Usage: node scripts/demo.js [apiBase]
 */
const api = process.argv[2] || 'http://localhost:3000/api';

async function call(method, path, body) {
  const res = await fetch(api + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${typeof json === 'string' ? json : JSON.stringify(json).slice(0, 300)}`);
  return json;
}

const eur = (v) => (v === null || v === undefined ? 'n/a' : `${Number(v).toFixed(2)} €`);

(async () => {
  console.log('\n1. Catalog');
  const facets = await call('GET', '/catalog/facets');
  console.log(`   ${facets.recordCount} historical analyses from ${facets.workbooks.length} workbooks, embeddings: ${facets.embeddings.status}`);

  console.log('\n2. Search "prefabricated balcony 1600x2560"');
  const search = await call('GET', '/catalog/search?q=' + encodeURIComponent('prefabricated balcony 1600x2560') + '&limit=5');
  for (const h of search.hits) console.log(`   ${(h.score * 100).toFixed(0).padStart(3)}%  ${h.record.id.padEnd(14)} ${h.record.title}  (${eur(h.record.unitCost)} / ${h.record.unit})`);
  const pick = search.hits.find((h) => h.record.id === 'TM1643-06#10') || search.hits[0];

  console.log(`\n3. Similar analyses to ${pick.record.id}`);
  const similar = await call('GET', `/catalog/${encodeURIComponent(pick.record.id)}/similar?limit=4`);
  for (const h of similar) console.log(`   ${(h.score * 100).toFixed(0).padStart(3)}%  ${h.record.id.padEnd(14)} ${h.record.title}`);

  console.log('\n4. Project + cart');
  const ref = 'TM2099-' + String(Date.now() % 100).padStart(2, '0');
  let project = await call('POST', '/projects', { name: 'Demo - Nave 4 Balcony', customer: 'APEXA', reference: ref, date: new Date().toISOString().slice(0, 10), estimator: 'make demo', templateWorkbook: 'TM1643-06 Analisi.xlsx' });
  project = await call('POST', `/projects/${project.id}/items`, { catalogId: pick.record.id, quantity: 50 });
  const repeat = similar.find((h) => h.record.id === 'TM1823-03#10');
  if (repeat) project = await call('POST', `/projects/${project.id}/items`, { catalogId: repeat.record.id, quantity: 5 });
  const item = project.items[0];
  const prm = item.params.find((p) => p.cell === 'N4');
  if (prm) project = await call('PATCH', `/projects/${project.id}/items/${item.id}`, { params: [{ cell: 'N4', value: 1700 }] });
  const validation = await call('GET', `/projects/${project.id}/validation`);
  console.log(`   project ${project.id} (${ref}) with ${project.items.length} items, validation ok=${validation.ok}, indicative total ${eur(validation.estimatedTotal)}`);
  for (const i of validation.issues) console.log(`   - [${i.level}] ${i.message}`);

  console.log('\n5. Generate Excel analysis');
  const gen = await call('POST', `/projects/${project.id}/generate`);
  const r = gen.report;
  console.log(`   status: ${r.status}  engine: ${r.engine}  recalculated: ${r.recalculation.performed}`);
  console.log(`   ${r.summary}`);
  console.log(`   file:   data/output/${gen.outputFile}`);
  console.log(`   report: data/output/${gen.reportFile}`);
  for (const it of r.items) console.log(`   - ${it.itemCode} -> sheet '${it.sheet}' (ELENCO COSTI row ${it.row}, BOQ row ${it.boqRow}), qty ${it.quantity}, historical ${eur(it.historicalUnitCost)}, recalculated ${eur(it.unitCost)}, missing codes ${it.missingCodes.length}`);
  const levels = r.checks.reduce((a, c) => ((a[c.level] = (a[c.level] || 0) + 1), a), {});
  console.log(`   checks: ${JSON.stringify(levels)}`);
  for (const c of r.checks.filter((c) => c.level !== 'ok')) console.log(`   - [${c.level}] ${c.check}: ${c.detail.slice(0, 160)}`);
  console.log('\nOpen the .xlsx in Excel to recalculate (choose "don\'t update links"), then compare ELENCO COSTI!J with the historical unit costs.\n');
})().catch((e) => {
  console.error('demo failed:', e.message);
  process.exit(1);
});
