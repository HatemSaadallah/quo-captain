/**
 * Seed: a mock estimator user and a sample quotation (cart) built from the
 * extracted catalog. Idempotent. Run with `npm run db:seed` (after `npm run extract`).
 *
 *   login: estimator@somec.local / somec2026   (role estimator)
 *          admin@somec.local     / somec2026   (role admin)
 */
import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';
import type { Catalog } from '../src/common/interfaces/catalog.interface';
import { hashPassword } from '../src/common/utils/password';
import { CATALOG_FILE } from '../src/common/utils/paths';
import { itemFromCatalog } from '../src/modules/quotations/quotation.rules';

const prisma = new PrismaClient();

const USERS = [
  { email: 'estimator@somec.local', name: 'Mock Estimator', password: 'somec2026', role: 'estimator' },
  { email: 'admin@somec.local', name: 'Somec Admin', password: 'somec2026', role: 'admin' },
];

async function main(): Promise<void> {
  const users = [];
  for (const u of USERS) {
    const row = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role },
      create: { email: u.email, name: u.name, role: u.role, passwordHash: hashPassword(u.password) },
    });
    users.push(row);
    console.log(`user ${row.email} (${row.role})`);
  }
  const owner = users[0];

  if (!existsSync(CATALOG_FILE)) {
    console.log(`catalog not found (${CATALOG_FILE}); run "npm run extract" and seed again to get the sample quotation`);
    return;
  }
  const catalog = JSON.parse(readFileSync(CATALOG_FILE, 'utf8')) as Catalog;
  // The original sample: explicit lines with a parameter change.
  await createQuotation(owner, catalog, {
    reference: 'TM2099-00',
    name: 'Nave 4 - Balcony (seed)',
    customer: 'APEXA',
    date: new Date().toISOString().slice(0, 10),
    template: 'TM1643-06 Analisi.xlsx',
    status: 'draft',
    lines: [
      { id: 'TM1643-06#10', quantity: 50, params: { N4: 1700 } }, // PRE-FAB BALCONY Type 1 1600x2560, deeper floor
      { id: 'TM1643-06#12', quantity: 8 }, // balcony next to steel
      { id: 'TM1643-06#45', quantity: 120 }, // balustrade (ML)
    ],
  });
  // Demo history: quotations picked from the catalog by product type, spread over customers and dates.
  const demo: Array<{ reference: string; name: string; customer: string; date: string; template: string; picks: Array<[RegExp, number]> }> = [
    { reference: 'TM2101-00', name: 'Nave 5 - Pool deck windscreens', customer: 'OMNIX', date: '2026-02-11', template: 'TM2030-00 Analisi.xlsx', picks: [[/windscreen/i, 3]] },
    { reference: 'TM2102-00', name: 'Nave 5 - Suite dividers & sliding doors', customer: 'OMNIX', date: '2026-04-02', template: 'TM2030-00 Analisi.xlsx', picks: [[/divider/i, 2], [/door/i, 1]] },
    { reference: 'TM2103-01', name: 'Nave 6 - Balcony flooring refit', customer: 'ACME', date: '2026-05-20', template: 'TM2086-01 Analisi.xlsx', picks: [[/flooring|teak/i, 2], [/handrail/i, 1]] },
    { reference: 'TM2104-00', name: 'Nave 7 - Aft balustrades', customer: 'APEXA', date: '2026-07-08', template: 'TM1837-02 Analisi.xlsx', picks: [[/balustrade/i, 2], [/handrail/i, 1]] },
    { reference: 'TM2105-00', name: 'Nave 8 - Prefabricated balcony package', customer: 'ACME', date: '2026-09-15', template: 'TM2086-01 Analisi.xlsx', picks: [[/pre-?fab|platform/i, 2], [/balustrade/i, 1], [/divider/i, 1]] },
  ];
  // More history so the quotation list has pages to browse.
  const scopes: Array<[string, Array<[RegExp, number]>]> = [
    ['Windscreens upper decks', [[/windscreen/i, 2]]],
    ['Balcony dividers', [[/divider/i, 3]]],
    ['Glass balustrades', [[/balustrade/i, 2]]],
    ['Sliding doors & dividers', [[/door/i, 1], [/divider/i, 1]]],
    ['Teak & resin flooring', [[/flooring|teak|raised floor/i, 3]]],
    ['Handrails & balustrades', [[/handrail/i, 2], [/balustrade/i, 1]]],
    ['Prefab balconies', [[/pre-?fab|platform/i, 2]]],
    ['Pool deck windscreens', [[/windscreen/i, 3]]],
    ['Suite balcony package', [[/pre-?fab|platform/i, 1], [/divider/i, 1], [/flooring/i, 1]]],
  ];
  const customers = ['APEXA', 'OMNIX', 'ACME'];
  const templates = ['TM1643-06 Analisi.xlsx', 'TM2030-00 Analisi.xlsx', 'TM2086-01 Analisi.xlsx', 'TM1641-03 Analisi.xlsx', 'TM1823-03 Analisi.xlsx', 'TM1837-02 Analisi.xlsx'];
  for (let i = 0; i < 18; i++) {
    const [label, picks] = scopes[i % scopes.length];
    const month = new Date(Date.UTC(2025, 1 + i, 3 + ((i * 7) % 24)));
    demo.push({ reference: `TM${2106 + i}-0${i % 3}`, name: `Nave ${9 + Math.floor(i / 2)} - ${label}`, customer: customers[i % 3], date: month.toISOString().slice(0, 10), template: templates[i % templates.length], picks });
  }
  const usable = catalog.records.filter((r) => r.sheet && r.unitCost && !/deduct|extra|option|install|pipe|drain/i.test(r.title ?? ''));
  for (const d of demo) {
    const lines: Line[] = [];
    for (const [re, n] of d.picks) {
      const pool = usable.filter((r) => re.test(r.title ?? '') && !lines.some((l) => l.id === r.id));
      const ordered = [...pool.filter((r) => r.workbook === d.template), ...pool.filter((r) => r.workbook !== d.template)];
      for (const r of ordered.slice(0, n)) lines.push({ id: r.id, quantity: Math.max(1, Math.round((r.quantity ?? 10) * 0.8)) });
    }
    await createQuotation(owner, catalog, { ...d, lines, status: d.reference === 'TM2118-00' ? 'draft' : 'active' });
  }
}

type Line = { id: string; quantity: number; params?: Record<string, number> };

async function createQuotation(
  owner: { id: string; name: string; email?: string },
  catalog: Catalog,
  q: { reference: string; name: string; customer: string; date: string; template: string; lines: Line[]; status: 'draft' | 'active' },
): Promise<void> {
  const existing = await prisma.quotation.findFirst({ where: { ownerId: owner.id, reference: q.reference } });
  if (existing) {
    await prisma.quotation.update({ where: { id: existing.id }, data: { status: q.status } });
    const existingItems = await prisma.quotationItem.findMany({ where: { quotationId: existing.id, catalogId: { not: null }, referenceTabId: null }, select: { id: true, catalogId: true } });
    for (const item of existingItems) {
      const tab = await prisma.referenceTab.findUnique({ where: { id: item.catalogId! }, select: { id: true } });
      if (tab) await prisma.quotationItem.update({ where: { id: item.id }, data: { referenceTabId: tab.id } });
    }
    console.log(`quotation ${q.reference} already exists (${existing.id}), status ${q.status}`);
    return;
  }
  const quotation = await prisma.quotation.create({
    data: { status: q.status, name: q.name, customer: q.customer, reference: q.reference, date: q.date, estimator: owner.name, templateWorkbook: q.template, ownerId: owner.id },
  });
  let order = 0;
  for (const line of q.lines) {
    const rec = catalog.records.find((r) => r.id === line.id);
    if (!rec) {
      console.log(`  catalog record ${line.id} missing, skipped`);
      continue;
    }
    const item = itemFromCatalog(rec, line.quantity);
    const tab = await prisma.referenceTab.findUnique({ where: { id: item.catalogId! }, select: { id: true } });
    for (const p of item.params) if (line.params && p.cell in line.params) p.value = line.params[p.cell];
    await prisma.quotationItem.create({
      data: {
        quotationId: quotation.id,
        sortOrder: ++order,
        catalogId: item.catalogId,
        referenceTabId: tab?.id ?? null,
        sourceWorkbook: item.sourceWorkbook,
        sourceSheet: item.sourceSheet,
        sourceOfferNo: item.sourceOfferNo,
        position: item.position,
        itemCode: item.itemCode,
        description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        L: item.L,
        H: item.H,
        lotto: item.lotto,
        params: JSON.stringify(item.params),
        historicalUnitCost: item.historicalUnitCost,
        historicalQuantity: item.historicalQuantity,
        dependsOnSheets: JSON.stringify(item.dependsOnSheets),
        notes: 'seed data',
      },
    });
  }
  console.log(`quotation ${q.reference} created with ${order} items (${quotation.id}) for ${owner.email ?? owner.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
