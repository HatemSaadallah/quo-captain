import { seedMarket } from './seed-market';
import type { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { CostBreakdownRow } from '../src/common/interfaces/catalog.interface';

// Explicit demo purchase rates: the supplied index has product prices, not raw-material prices.
const MATERIALS = [
  ['VETRO', 'Laminated / tempered glass', 'Glass', 'm²', 85],
  ['VETROS', 'Special glazing', 'Glass', 'm²', 140],
  ['ACCSTR', 'Iron / carbon steel structures', 'Carbon steel', 'kg', 1.25],
  ['ACCLAM', 'Iron / carbon steel sheets', 'Carbon steel', 'kg', 1.4],
  ['ACXSTR', 'Stainless steel structures', 'Stainless steel', 'kg', 5.8],
  ['ACXLAM', 'Stainless steel sheets', 'Stainless steel', 'kg', 6.2],
  ['ACXPRO', 'Stainless steel profiles', 'Stainless steel', 'kg', 6.5],
  ['ALUPRO', 'Aluminium profiles', 'Aluminium', 'kg', 4.5],
  ['ALULAM', 'Aluminium sheets', 'Aluminium', 'kg', 4.2],
  ['ALUSTR', 'Aluminium structures', 'Aluminium', 'kg', 4.8],
  ['G', 'Rubber gaskets', 'Gaskets', 'm', 2.4],
  ['SIG', 'Silicone / adhesive sealant', 'Sealants', 'pcs', 8.5],
  ['VITI', 'Screws, bolts and fixings', 'Fixings', 'pcs', 0.45],
  ['ACCSS', 'Assembly accessories', 'Accessories', 'pcs', 12],
  ['PIETRA', 'Stone / mineral flooring', 'Flooring', 'm²', 65],
  ['ISOL', 'Fire insulation', 'Insulation', 'm²', 18],
  ['TEAK', 'Teak / timber', 'Timber', 'm²', 120],
  ['RESIN', 'Resin / epoxy', 'Resin', 'kg', 9],
  ['PVC', 'Synthetic / PVC panels', 'Synthetic', 'm²', 35],
  ['COMPOSITE', 'Composite / honeycomb panels', 'Composite', 'm²', 55],
] as const;

type SourceProduct = { sourceId: string; catalogId: string; materialCodes: string[] };
const units: Record<string, string> = { MQ: 'm²', M2: 'm²', ML: 'm', PZ: 'pcs', PCS: 'pcs', KG: 'kg' };
const unitLabel = (value: string): string => units[value.toUpperCase()] ?? value;
const round = (value: number): number => Number(value.toPrecision(10));

export async function seedMaterials(prisma: PrismaClient): Promise<void> {
  const fixture = JSON.parse(readFileSync(path.join(__dirname, 'data/material-products.json'), 'utf8')) as { sourceFile: string; products: SourceProduct[] };
  const source = new Map(fixture.products.map((product) => [product.catalogId, product]));
  const materials = new Map(MATERIALS.map(([code, name, category, unit, unitCost]) => [code as string, { code, name, category, unit, unitCost }]));
  for (const material of materials.values()) {
    await prisma.rawMaterial.upsert({
      where: { id: material.code },
      update: { name: material.name, category: material.category, unit: material.unit },
      create: { id: material.code, ...material, priceSource: 'mock', sourceNote: 'Explicit mock raw-material purchase rate; the supplied product index has no raw-material prices.' },
    });
  }
  await seedMarket(prisma);
  const references = await prisma.referenceTab.findMany();
  const ids = new Set(references.map((product) => product.id));
  const unmatched = fixture.products.filter((product) => !ids.has(product.catalogId));
  if (unmatched.length) throw new Error(`${unmatched.length} indexed products have no database reference tab; extract the catalog before seeding materials`);
  let links = 0;
  for (const product of references) {
    const imported = source.get(product.id);
    const rows = product.costBreakdown as unknown as CostBreakdownRow[];
    const ratios = rows.filter((row) => row.total != null && row.total > 0 && row.unitCost != null && row.unitCost > 0).map((row) => row.total! / row.unitCost!).filter(Number.isFinite).sort((a, b) => a - b);
    const basis = ratios.length ? ratios[Math.floor(ratios.length / 2)] : null;
    const productUnit = unitLabel(product.analysisUnit ?? product.unit ?? 'pcs');
    const linkedCategories = new Set<string>();
    const historicalCodes = new Set<string>();
    for (const row of rows) {
      const material = materials.get(row.code);
      if (!material || row.qty == null || !Number.isFinite(row.qty) || row.qty <= 0) continue;
      if (row.unit == null || unitLabel(row.unit) !== material.unit) throw new Error(`Material unit mismatch for ${product.id}/${row.code}`);
      const data = {
        quantity: round(basis ? row.qty / basis : row.qty), batchQuantity: row.qty,
        productUnit: basis ? productUnit : 'analysis batch', quantitySource: 'historical',
        sourceNote: basis ? `Analysis sheet ${product.workbook} / ${product.sheet}; original batch quantity ${row.qty} ${material.unit}, costing basis ${round(basis)} ${productUnit}.` : `Original analysis-batch quantity from ${product.workbook} / ${product.sheet}.`,
        sourceIndexId: imported?.sourceId ?? null,
      };
      await prisma.productMaterial.upsert({ where: { referenceTabId_materialId: { referenceTabId: product.id, materialId: material.code } }, create: { referenceTabId: product.id, materialId: material.code, ...data }, update: data });
      linkedCategories.add(material.category); historicalCodes.add(material.code); links++;
    }
    // Description-only materials get explicit mock quantities in seed data, never runtime defaults.
    for (const code of imported?.materialCodes ?? []) {
      const material = materials.get(code)!;
      if (historicalCodes.has(code) || linkedCategories.has(material.category)) continue;
      const area = productUnit === 'm²' ? 1 : product.L && product.H ? product.L * product.H / 1_000_000 : 1;
      const quantity = round(material.unit === 'kg' ? area * 6 : material.unit === 'm²' ? area * 1.08 : material.unit === 'm' ? Math.sqrt(area) * 4 : 4);
      const data = { quantity, batchQuantity: null, productUnit, quantitySource: 'mock', sourceIndexId: imported!.sourceId, sourceNote: `Estimated quantity for a material declared in ${fixture.sourceFile}; that index gives no component quantity.` };
      await prisma.productMaterial.upsert({ where: { referenceTabId_materialId: { referenceTabId: product.id, materialId: code } }, create: { referenceTabId: product.id, materialId: code, ...data }, update: data });
      linkedCategories.add(material.category); links++;
    }
  }
  console.log(`materials: ${materials.size} explicit mock price records; ${links} product material links seeded across ${references.length} existing products`);
}
