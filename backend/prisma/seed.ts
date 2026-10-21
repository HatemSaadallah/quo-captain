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
  const reference = 'TM2099-00';
  const existing = await prisma.quotation.findFirst({ where: { ownerId: owner.id, reference } });
  if (existing) {
    console.log(`sample quotation ${reference} already exists (${existing.id})`);
    return;
  }
  const lines: Array<{ id: string; quantity: number; params?: Record<string, number> }> = [
    { id: 'TM1643-06#10', quantity: 50, params: { N4: 1700 } }, // PRE-FAB BALCONY Type 1 1600x2560, deeper floor
    { id: 'TM1643-06#12', quantity: 8 }, // balcony next to steel
    { id: 'TM1643-06#45', quantity: 120 }, // balustrade (ML)
  ];
  const quotation = await prisma.quotation.create({
    data: { name: 'Nave 4 - Balcony (seed)', customer: 'APEXA', reference, date: new Date().toISOString().slice(0, 10), estimator: owner.name, templateWorkbook: 'TM1643-06 Analisi.xlsx', ownerId: owner.id },
  });
  let order = 0;
  for (const line of lines) {
    const rec = catalog.records.find((r) => r.id === line.id);
    if (!rec) {
      console.log(`  catalog record ${line.id} missing, skipped`);
      continue;
    }
    const item = itemFromCatalog(rec, line.quantity);
    for (const p of item.params) if (line.params && p.cell in line.params) p.value = line.params[p.cell];
    await prisma.quotationItem.create({
      data: {
        quotationId: quotation.id,
        sortOrder: ++order,
        catalogId: item.catalogId,
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
    console.log(`  item ${item.itemCode} x${item.quantity} from ${item.sourceOfferNo} sheet ${item.sourceSheet} (${item.historicalUnitCost} EUR)`);
  }
  console.log(`sample quotation ${reference} created (${quotation.id}) for ${owner.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
