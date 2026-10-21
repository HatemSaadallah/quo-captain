/** Mapping between catalog records (+ embedding) and the ReferenceTab table. */
import type { Prisma, PrismaClient, ReferenceTab } from '@prisma/client';
import type { Catalog, CatalogParam, CatalogRecord, CostBreakdownRow, EmbeddingIndex } from '../../common/interfaces/catalog.interface';

export function toReferenceTabData(r: CatalogRecord, embedding: number[] | undefined, index: EmbeddingIndex | null, extractedAt: string): Prisma.ReferenceTabCreateInput {
  return {
    id: r.id,
    workbook: r.workbook,
    offerNo: r.offerNo,
    client: r.client,
    projectName: r.projectName,
    estimator: r.estimator,
    projectDate: r.projectDate,
    row: r.row,
    sheet: r.sheet,
    position: r.position,
    categoryName: r.categoryName,
    itemCode: r.itemCode,
    title: r.title,
    description: r.description,
    unit: r.unit,
    quantity: r.quantity,
    L: r.L,
    H: r.H,
    m2Unit: r.m2Unit,
    unitCost: r.unitCost,
    totalCost: r.totalCost,
    lotto: r.lotto,
    analysisUnit: r.analysisUnit,
    productClass: r.productClass,
    sheetUnitCost: r.sheetUnitCost,
    sheetTotalCost: r.sheetTotalCost,
    unitWeightKg: r.unitWeightKg,
    params: r.params as unknown as Prisma.InputJsonValue,
    costBreakdown: r.costBreakdown as unknown as Prisma.InputJsonValue,
    codesUsed: r.codesUsed,
    dependsOnSheets: r.dependsOnSheets,
    sourceCells: r.sourceCells,
    warnings: r.warnings,
    lineItemCount: r.lineItemCount,
    errorCells: r.errorCells,
    hasExternalRefs: r.hasExternalRefs,
    searchText: r.searchText,
    embedding: embedding ?? [],
    embeddingModel: embedding ? (index?.model ?? null) : null,
    fingerprint: embedding ? (index?.fingerprint ?? null) : null,
    extractedAt: new Date(extractedAt),
  };
}

export function fromReferenceTab(t: ReferenceTab): CatalogRecord {
  return {
    id: t.id,
    workbook: t.workbook,
    offerNo: t.offerNo,
    client: t.client,
    projectName: t.projectName,
    estimator: t.estimator,
    projectDate: t.projectDate,
    row: t.row,
    sheet: t.sheet,
    position: t.position,
    categoryName: t.categoryName,
    itemCode: t.itemCode,
    title: t.title,
    description: t.description,
    unit: t.unit,
    quantity: t.quantity,
    L: t.L,
    H: t.H,
    m2Unit: t.m2Unit,
    unitCost: t.unitCost,
    totalCost: t.totalCost,
    lotto: t.lotto,
    analysisUnit: t.analysisUnit,
    productClass: t.productClass,
    sheetUnitCost: t.sheetUnitCost,
    sheetTotalCost: t.sheetTotalCost,
    unitWeightKg: t.unitWeightKg,
    params: t.params as unknown as CatalogParam[],
    costBreakdown: t.costBreakdown as unknown as CostBreakdownRow[],
    codesUsed: t.codesUsed as string[],
    dependsOnSheets: t.dependsOnSheets as string[],
    sourceCells: t.sourceCells as Record<string, string>,
    warnings: t.warnings as string[],
    lineItemCount: t.lineItemCount,
    errorCells: t.errorCells,
    hasExternalRefs: t.hasExternalRefs,
    searchText: t.searchText,
  };
}

/** Upsert every catalog record (with its vector) into the ReferenceTab table. Returns the number of rows written. */
export async function syncReferenceTabs(prisma: PrismaClient, catalog: Catalog, index: EmbeddingIndex | null): Promise<number> {
  const vectorOf = new Map<string, number[]>();
  if (index) index.ids.forEach((id, i) => vectorOf.set(id, index.vectors[i]));
  let n = 0;
  for (let i = 0; i < catalog.records.length; i += 50) {
    const batch = catalog.records.slice(i, i + 50).map((r) => {
      const data = toReferenceTabData(r, vectorOf.get(r.id), index, catalog.generatedAt);
      return prisma.referenceTab.upsert({ where: { id: r.id }, create: data, update: data });
    });
    await prisma.$transaction(batch);
    n += batch.length;
  }
  const ids = new Set(catalog.records.map((r) => r.id));
  const stale = await prisma.referenceTab.findMany({ select: { id: true } });
  const toDelete = stale.filter((s) => !ids.has(s.id)).map((s) => s.id);
  if (toDelete.length) await prisma.referenceTab.deleteMany({ where: { id: { in: toDelete } } });
  return n;
}
