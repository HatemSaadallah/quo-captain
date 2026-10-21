import { describe, expect, it, vi } from 'vitest';
import type { Project } from '../../common/interfaces/project.interface';
import type { PrismaService } from '../prisma/prisma.service';
import type { ProjectsService } from './projects.service';
import { buildDashboard, DashboardService, type DashboardBom } from './dashboard.service';

const product = { id: 'i1', catalogId: 'product1', referenceTabId: null, description: 'Balcony', unit: 'Pcs', quantity: 2, historicalUnitCost: 10, unitCostOverride: 0 };
const project = { id: 'p1', name: 'Nave 17', customerId: 'c1', customer: 'OMNIX', quotations: [
  { id: 'q1', date: '2026-01-01', status: 'active', items: [product] },
  { id: 'q2', date: '2026-02-28', status: 'draft', items: [{ ...product, id: 'i2', quantity: 3, unitCostOverride: null }, { ...product, id: 'free', catalogId: null, description: 'Uncosted service', quantity: 1, historicalUnitCost: null, unitCostOverride: null }] },
  { id: 'q3', date: '2026-03-01', status: 'active', items: [product] },
] } as unknown as Project;
const bom: DashboardBom[] = [
  { referenceTabId: 'product1', customProductId: null, quantity: 2, productUnit: 'PZ', quantitySource: 'historical', material: { id: 'steel', name: 'Steel', unit: 'kg' } },
  { referenceTabId: 'product1', customProductId: null, quantity: .5, productUnit: 'pcs', quantitySource: 'mock', material: { id: 'glass', name: 'Glass', unit: 'm²' } },
];
const customers = [{ id: 'c1', name: 'OMNIX' }];

describe('Dashboard analytics', () => {
  it('uses inclusive quotation dates, respects zero overrides and marks unknown costs', () => {
    const result = buildDashboard([project], customers, bom, { from: '2026-01-01', to: '2026-02-28' });
    expect(result.totals).toMatchObject({ customers: 1, projects: 1, quotations: 2, active: 1, draft: 1, estimatedCost: 30, uncostedItems: 1, products: 2, materials: 2, unmappedLines: 1 });
    expect(result.months.map((month) => month.estimatedCost)).toEqual([0, 30]);
    expect(result.products.find((row) => row.id === 'product1')).toMatchObject({ quantity: 5, unit: 'pcs', quotations: 2, trend: [2, 3] });
  });
  it('keeps material units separate and identifies mock BOM quantities', () => {
    const result = buildDashboard([project], customers, bom, { to: '2026-02-28' });
    expect(result.materials.find((row) => row.id === 'steel')).toMatchObject({ quantity: 10, unit: 'kg', mockQuantity: 0 });
    expect(result.materials.find((row) => row.id === 'glass')).toMatchObject({ quantity: 2.5, unit: 'm²', mockQuantity: 2.5 });
  });
  it('excludes incompatible quantity bases rather than multiplying mixed units', () => {
    const mixed = { ...project, quotations: [{ ...project.quotations[0], items: [{ ...project.quotations[0].items[0], unit: 'm²' }] }] };
    const result = buildDashboard([mixed], customers, bom, {});
    expect(result.materials).toEqual([]);
    expect(result.totals.incompatibleLines).toBe(1);
  });
  it('filters customer and quotation status and handles empty selections', () => {
    expect(buildDashboard([project], customers, bom, { status: 'draft' }).totals).toMatchObject({ quotations: 1, active: 0, draft: 1 });
    const empty = buildDashboard([project], customers, bom, { customerId: 'another-customer' });
    expect(empty.totals.quotations).toBe(0); expect(empty.materials).toEqual([]);
    expect(empty.months.every((month) => month.quotations === 0)).toBe(true);
  });
  it('rejects invalid dates, reversed ranges and invalid statuses', () => {
    for (const filters of [{ from: '2026-02-30' }, { from: 'oops' }, { from: '2026-03-01', to: '2026-01-01' }, { status: 'won' }]) expect(() => buildDashboard([project], customers, bom, filters)).toThrow();
  });
  it('queries only the signed-in user and BOMs linked to their quotation products', async () => {
    const projects = { list: vi.fn().mockResolvedValue([project]), listCustomers: vi.fn().mockResolvedValue(customers) };
    const prisma = { productMaterial: { findMany: vi.fn().mockResolvedValue(bom) } };
    await new DashboardService(projects as unknown as ProjectsService, prisma as unknown as PrismaService).get('owner1', {});
    expect(projects.list).toHaveBeenCalledWith('owner1'); expect(projects.listCustomers).toHaveBeenCalledWith('owner1');
    expect(prisma.productMaterial.findMany.mock.calls[0][0].where.OR).toEqual([{ referenceTabId: { in: ['product1'] } }, { customProductId: { in: ['product1'] } }]);
  });
});
