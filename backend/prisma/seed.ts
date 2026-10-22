/**
 * Seed: a demo estimator user and sample quotations built from the
 * extracted catalog. Idempotent. Run with `npm run db:seed` (after `npm run extract`).
 *
 *   login: estimator@somec.local / somec2026   (role salesperson)
 *          admin@somec.local     / somec2026   (role admin)
 */
import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';
import type { Catalog, CatalogRecord } from '../src/common/interfaces/catalog.interface';
import { hashPassword } from '../src/common/utils/password';
import { CATALOG_FILE } from '../src/common/utils/paths';
import { itemFromCatalog } from '../src/modules/quotations/quotation.rules';
import { seedMaterials } from './seed-materials';

const prisma = new PrismaClient();

const USERS = [
  { email: 'estimator@somec.local', name: 'Michele Sossai', password: 'somec2026', role: 'salesperson' },
  { email: 'admin@somec.local', name: 'Somec Admin', password: 'somec2026', role: 'admin' },
];

const PROJECT_CONTACTS = [
  { id: 'anna.virtanen@apexa.local', name: 'Anna Virtanen', role: 'Procurement Manager, Outfitting', company: 'APEXA', email: 'anna.virtanen@apexa.local' },
  { id: 'jonas.weber@apexa.local', name: 'Jonas Weber', role: 'Buyer, Glazing & Balconies', company: 'APEXA', email: 'jonas.weber@apexa.local' },
  { id: 'claire.lefevre@omnix.local', name: 'Claire Lefèvre', role: 'Purchasing Manager', company: 'OMNIX', email: 'claire.lefevre@omnix.local' },
  { id: 'matteo.rinaldi@omnix.local', name: 'Matteo Rinaldi', role: 'Senior Buyer, Hull Outfitting', company: 'OMNIX', email: 'matteo.rinaldi@omnix.local' },
  { id: 'hannah.larsen@acme.local', name: 'Hannah Larsen', role: 'Category Buyer, Accommodation', company: 'ACME', email: 'hannah.larsen@acme.local' },
  { id: 'pietro.conte@acme.local', name: 'Pietro Conte', role: 'Procurement Specialist', company: 'ACME', email: 'pietro.conte@acme.local' },
];

// Repairs two legacy seed rows that predate mandatory customer assignment.
// The customer is set explicitly from the matching seed-analysis clients.
const LEGACY_CUSTOMER_REPAIRS: Array<{ reference: string; customer: string }> = [
  { reference: 'TM2124-00', customer: 'ACME' },
  { reference: 'TM2125-00', customer: 'APEXA' },
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
  for (const c of PROJECT_CONTACTS) await prisma.contact.upsert({ where: { id: c.id }, update: c, create: c });

  await repairLegacyCustomers(owner.id);

  if (!existsSync(CATALOG_FILE)) {
    console.log(`catalog not found (${CATALOG_FILE}); run "npm run extract" and seed again to get the sample quotation`);
    await attachExistingQuotations();
    await seedMaterials(prisma);
    return;
  }
  const catalog = JSON.parse(readFileSync(CATALOG_FILE, 'utf8')) as Catalog;
  // Demo history: quotations picked from the catalog by product type, spread over customers and dates.
  // Title patterns per product family; anchored so e.g. "RAISED PLATFORM FOR ADA SLIDING DOORS" is not a door.
  const WINDSCREEN = /^(?!.*(handrail|hatch|guardrail|fall protection)).*wind ?screen/i;
  const DOOR = /^(standard|motorized) sliding doors?/i;
  const HANDRAIL = /^(?!.*step).*handrail/i;
  const BALCONY = /^(pre-?fab(ricated)? (balcony|aluminium platform)|pref\. balcony)/i;
  const FLOORING = /flooring|raised floor/i;
  const demo: Array<{ reference: string; name: string; customer: string; date: string; template: string; picks: Array<[RegExp, number, number?]> }> = [
    { reference: 'TM2101-00', name: 'Nave 5 - Pool deck windscreens', customer: 'OMNIX', date: '2026-02-11', template: 'TM2030-00 Analisi.xlsx', picks: [[WINDSCREEN, 3]] },
    { reference: 'TM2102-00', name: 'Nave 5 - Suite dividers & sliding doors', customer: 'OMNIX', date: '2026-04-02', template: 'TM2030-00 Analisi.xlsx', picks: [[/divider/i, 2], [DOOR, 1, 140]] },
    { reference: 'TM2103-01', name: 'Nave 6 - Balcony flooring refit', customer: 'ACME', date: '2026-05-20', template: 'TM2086-01 Analisi.xlsx', picks: [[FLOORING, 2], [HANDRAIL, 1]] },
    { reference: 'TM2104-00', name: 'Nave 7 - Aft balustrades', customer: 'APEXA', date: '2026-07-08', template: 'TM1837-02 Analisi.xlsx', picks: [[/balustrade/i, 2], [HANDRAIL, 1]] },
    { reference: 'TM2105-00', name: 'Nave 8 - Prefabricated balcony package', customer: 'ACME', date: '2026-09-15', template: 'TM2086-01 Analisi.xlsx', picks: [[BALCONY, 2], [/balustrade/i, 1], [/divider/i, 1]] },
  ];
  // More history so the quotation list has pages to browse.
  const scopes: Array<[string, Array<[RegExp, number, number?]>]> = [
    ['Windscreens upper decks', [[WINDSCREEN, 2]]],
    ['Balcony dividers', [[/divider/i, 3]]],
    ['Glass balustrades', [[/balustrade/i, 2]]],
    ['Sliding doors & dividers', [[DOOR, 1], [/divider/i, 1]]],
    ['Teak & resin flooring', [[/(teak|resin)\b.*floor/i, 3]]],
    ['Handrails & balustrades', [[HANDRAIL, 2], [/balustrade/i, 1]]],
    ['Prefab balconies', [[BALCONY, 2]]],
    ['Pool deck windscreens', [[WINDSCREEN, 3]]],
    ['Suite balcony package', [[BALCONY, 1], [/divider/i, 1], [FLOORING, 1]]],
  ];
  const customers = ['APEXA', 'OMNIX', 'ACME'];
  const templates = ['TM1643-06 Analisi.xlsx', 'TM2030-00 Analisi.xlsx', 'TM2086-01 Analisi.xlsx', 'TM1641-03 Analisi.xlsx', 'TM1823-03 Analisi.xlsx', 'TM1837-02 Analisi.xlsx'];
  // One customer per vessel: a hull number never appears under two shipyards.
  const vessels = [9, 21, 10, 22, 23, 11, 12, 24, 13, 25, 26, 14, 27, 15, 16, 28, 29, 17];
  for (let i = 0; i < 18; i++) {
    const [label, picks] = scopes[i % scopes.length];
    const month = new Date(Date.UTC(2025, 1 + i, 3 + ((i * 7) % 24)));
    demo.push({ reference: `TM${2106 + i}-0${i % 3}`, name: `Nave ${vessels[i]} - ${label}`, customer: customers[i % 3], date: month.toISOString().slice(0, 10), template: templates[i % templates.length], picks });
  }
  // Real products only: no variations, tests, mock-ups, paint jobs, extras or deductions.
  const usable = catalog.records.filter((r) => r.sheet && r.unitCost && r.unitCost > 0 && !/deduct|extra|option|install|pipe|drain|addition|var\.?\s?\d|mock|test|spare|not nec|paint|mural|reinforc|enhanc|change of|update of|foundation|blast|n\.b\.|diventa|#/i.test(r.title ?? ''));
  const uses = new Map<string, number>();
  for (const [index, d] of demo.entries()) {
    const lines: Line[] = [];
    const titles = new Set<string>(); // the same product often appears in several workbooks
    // Repeated scopes rotate through the pool and scale quantities differently, so no two quotations are clones.
    const factor = 0.6 + ((index * 37) % 80) / 100;
    for (const [re, n, max] of d.picks) {
      const nth = uses.get(re.source) ?? 0;
      uses.set(re.source, nth + 1);
      const pool = usable.filter((r) => re.test(r.title ?? '') && !titles.has(r.title ?? ''));
      const ordered = [...pool.filter((r) => r.workbook === d.template), ...pool.filter((r) => r.workbook !== d.template)];
      const offset = ordered.length ? (nth * n) % ordered.length : 0;
      const unique = [...ordered.slice(offset), ...ordered.slice(0, offset)].filter((r, i, all) => all.findIndex((x) => x.title === r.title) === i);
      for (const r of unique.slice(0, n)) {
        titles.add(r.title ?? '');
        lines.push({ id: r.id, quantity: demoQuantity(r, factor, max) });
      }
    }
    const estimator = d.picks.some(([re]) => re === BALCONY) ? 'Andrea Coan' : owner.name;
    await createQuotation(owner, catalog, { ...d, lines, status: 'active', estimator });
  }
  await attachExistingQuotations();
  await seedMaterials(prisma);
  // Project dates follow their quotations, so lists sort by real activity rather than seed time.
  await prisma.$executeRaw`
    UPDATE "Project" p SET "createdAt" = q.first - interval '7 days', "updatedAt" = q.last
    FROM (SELECT "projectId", min("createdAt") AS first, max("updatedAt") AS last FROM "Quotation" GROUP BY "projectId") q
    WHERE p.id = q."projectId"`;
}

/** Historical quantity scaled per quotation and snapped to whole modules, so m² and m lines match the element size. */
function demoQuantity(r: CatalogRecord, factor: number, maxPieces = Infinity): number {
  const unit = (r.unit ?? '').toLowerCase();
  const module = /m²|m2/.test(unit) && r.L && r.H ? (r.L * r.H) / 1_000_000 : /^m$/.test(unit) && r.L ? r.L / 1000 : 1;
  const pieces = Math.min(maxPieces, Math.max(1, Math.round(((r.quantity ?? 10) * factor) / module)));
  return Math.round(pieces * module * 100) / 100;
}

type Line = { id: string; quantity: number; params?: Record<string, number> };

async function createQuotation(
  owner: { id: string; name: string; email?: string },
  catalog: Catalog,
  q: { reference: string; name: string; customer: string; date: string; template: string; lines: Line[]; status: 'draft' | 'active'; estimator?: string },
): Promise<void> {
  const project = await ensureProject(owner.id, q.customer, projectName(q.name));
  const existing = await prisma.quotation.findFirst({ where: { ownerId: owner.id, reference: q.reference } });
  if (existing) {
    await prisma.quotation.update({ where: { id: existing.id }, data: { status: q.status, projectId: project.id, customer: q.customer, name: q.name } });
    const existingItems = await prisma.quotationItem.findMany({ where: { quotationId: existing.id, catalogId: { not: null }, referenceTabId: null }, select: { id: true, catalogId: true } });
    for (const item of existingItems) {
      const tab = await prisma.referenceTab.findUnique({ where: { id: item.catalogId! }, select: { id: true } });
      if (tab) await prisma.quotationItem.update({ where: { id: item.id }, data: { referenceTabId: tab.id } });
    }
    console.log(`quotation ${q.reference} already exists (${existing.id}), status ${q.status}`);
    return;
  }
  // Dated like real history: created on the quotation date, last edited a few days later.
  const createdAt = new Date(`${q.date}T09:00:00Z`);
  const updatedAt = new Date(Math.min(Date.now(), createdAt.getTime() + (1 + (Number(q.reference.slice(2, 6)) % 9)) * 86_400_000 + 7.5 * 3_600_000));
  const quotation = await prisma.quotation.create({
    data: { status: q.status, name: q.name, customer: q.customer, projectId: project.id, reference: q.reference, date: q.date, estimator: q.estimator ?? owner.name, templateWorkbook: q.template, ownerId: owner.id, createdAt, updatedAt },
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

function projectName(quotationName: string): string {
  const vessel = quotationName.match(/^(Nave\s+\d+)/i)?.[1];
  return vessel ?? quotationName.trim();
}

async function ensureProject(ownerId: string, customerName: string, name: string) {
  const customer = await prisma.customer.upsert({
    where: { ownerId_name: { ownerId, name: customerName.trim() } }, update: {},
    create: { ownerId, name: customerName.trim() },
  });
  const contacts = await prisma.contact.findMany({ where: { company: customer.name } });
  if (!contacts.length) throw new Error(`No seeded directory contacts for customer ${customer.name}`);
  const project = await prisma.project.upsert({
    where: { ownerId_customerId_name: { ownerId, customerId: customer.id, name } }, update: {},
    create: { ownerId, customerId: customer.id, name, contacts: { create: contacts.map((contact) => ({ contactId: contact.id })) } },
  });
  for (const contact of contacts) await prisma.projectContact.upsert({ where: { projectId_contactId: { projectId: project.id, contactId: contact.id } }, update: {}, create: { projectId: project.id, contactId: contact.id } });
  return project;
}

async function attachExistingQuotations(): Promise<void> {
  const unattached = await prisma.$queryRaw<Array<{ id: string; ownerId: string; name: string; customer: string; reference: string }>>`
    SELECT "id", "ownerId", "name", "customer", "reference"
    FROM "Quotation"
    WHERE "projectId" IS NULL
  `;
  for (const q of unattached) {
    const customer = q.customer.trim();
    if (!customer) throw new Error(`Quotation ${q.reference || q.id} has no customer; seed repair needs its customer before linking a project`);
    const project = await ensureProject(q.ownerId, customer, projectName(q.name));
    await prisma.quotation.update({ where: { id: q.id }, data: { projectId: project.id } });
  }
  const rows = await prisma.quotation.findMany({ include: { project: { include: { customer: true } } } });
  for (const q of rows) {
    if (!q.project || !q.projectId) throw new Error(`Quotation ${q.id} (${q.reference}) has no project`);
    if (!q.customer.trim() || q.customer !== q.project.customer.name) throw new Error(`Quotation ${q.reference} and its project have different customers`);
  }
  console.log(`verified ${rows.length} quotations attached to customer projects`);
}

async function repairLegacyCustomers(ownerId: string): Promise<void> {
  for (const repair of LEGACY_CUSTOMER_REPAIRS) {
    const quotation = await prisma.quotation.findFirst({ where: { ownerId, reference: repair.reference } });
    if (quotation && !quotation.customer.trim()) {
      await prisma.quotation.update({ where: { id: quotation.id }, data: { customer: repair.customer } });
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
