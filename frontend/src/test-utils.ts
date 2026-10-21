import { vi } from 'vitest';
import type { CatalogRecord } from '../../backend/src/common/interfaces/catalog.interface';
import type { Project, ProjectItem } from '../../backend/src/common/interfaces/project.interface';

/** Minimal catalog record resembling TM1643-06#10 (balcony 1600x2560). */
export function record(over: Partial<CatalogRecord> = {}): CatalogRecord {
  return {
    id: 'TM1643-06#10',
    workbook: 'TM1643-06 Analisi.xlsx',
    offerNo: 'TM1643-06',
    client: 'APEXA',
    projectName: 'Nave 1 - Balcony',
    estimator: 'Massimo Brun',
    projectDate: '2025-03-07',
    row: 10,
    sheet: '10',
    position: '01',
    categoryName: 'PRE-FAB BALCONIES',
    itemCode: '01-01',
    title: 'PRE-FAB BALCONY Type 1 - 1.600x2.560 mm',
    description: 'PRE-FAB BALCONY Type 1 - 1.600x2.560 mm\nDesign Load 3,0 kN/m²',
    unit: 'Pcs',
    quantity: 712,
    L: 2560,
    H: 1600,
    m2Unit: 4.096,
    unitCost: 1090.7,
    totalCost: 776578.4,
    lotto: 'L1201',
    analysisUnit: 'PZ',
    productClass: 'L1201',
    sheetUnitCost: 1090.74,
    sheetTotalCost: 776607.42,
    unitWeightKg: 82.2,
    params: [
      { cell: 'N3', label: 'INTERASSE BALCONY', unit: 'MM', value: 2560, editable: true },
      { cell: 'N4', label: "PROFONDITA' BALCONY", unit: 'MM', value: 1594, editable: true },
      { cell: 'N5', label: 'SUPERFICIE TOTALE ELEMENTO', unit: 'MQ', value: 4.08, editable: false, formula: 'N4/1000*N3/1000' },
    ],
    costBreakdown: [{ category: 'ALLUMINIO - profili', code: 'ALUPRO', unit: 'KG', qty: 59744, unitCost: 338.57, total: 241060.18 }],
    lineItemCount: 214,
    codesUsed: ['PN', 'PTT'],
    errorCells: 3,
    dependsOnSheets: [],
    hasExternalRefs: false,
    sourceCells: { unitCost: "'ELENCO COSTI'!J10", quantity: "'ELENCO COSTI'!E10", sheetUnitCost: "'10'!E67" },
    warnings: [],
    searchText: 'prefab balcony type 1 1600x2560 mm',
    ...over,
  };
}

export function item(over: Partial<ProjectItem> = {}): ProjectItem {
  return {
    id: 'i1',
    catalogId: 'TM1643-06#10',
    referenceTabId: null,
    sourceWorkbook: 'TM1643-06 Analisi.xlsx',
    sourceSheet: '10',
    sourceOfferNo: 'TM1643-06',
    position: '01',
    itemCode: '01-01',
    description: 'PRE-FAB BALCONY Type 1 - 1.600x2.560 mm\nDesign Load 3,0 kN/m²',
    unit: 'Pcs',
    quantity: 50,
    L: 2560,
    H: 1600,
    lotto: 'L1201',
    params: [{ cell: 'N3', label: 'INTERASSE BALCONY', unit: 'MM', value: 2560, original: 2560 }],
    historicalUnitCost: 1090.7,
    historicalUnit: 'Pcs',
    historicalCostCompatible: true,
    historicalQuantity: 712,
    unitCostOverride: null,
    dependsOnSheets: [],
    notes: '',
    ...over,
  };
}

export function project(items: ProjectItem[] = [item()], over: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    ownerId: 'u1',
    name: 'Nave 4 - Balcony',
    customer: 'APEXA',
    reference: 'TM2099-00',
    date: '2026-10-21',
    estimator: 'Mock Estimator',
    templateWorkbook: 'TM1643-06 Analisi.xlsx',
    items,
    createdAt: '2026-10-21T00:00:00.000Z',
    updatedAt: '2026-10-21T00:00:00.000Z',
    generations: [],
    ...over,
  };
}

/** Stub global fetch with a router: (method, path) -> response body. */
export function mockFetch(router: (method: string, path: string, body: unknown) => unknown | { status: number; body: unknown }): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const out = router(init?.method ?? 'GET', path, body);
    const status = typeof out === 'object' && out !== null && 'status' in out && typeof (out as { status: unknown }).status === 'number' ? (out as { status: number }).status : 200;
    const payload = status === 200 ? out : (out as { body: unknown }).body;
    return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
