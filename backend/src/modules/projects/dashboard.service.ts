import { BadRequestException, Injectable } from '@nestjs/common';
import type { DashboardData } from '../../common/interfaces/dashboard.interface';
import type { Project } from '../../common/interfaces/project.interface';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from './projects.service';

export const normalizedUnit = (unit: string): string => {
  const key = unit.trim().toLowerCase();
  return ({ pz: 'pcs', pc: 'pcs', pcs: 'pcs', piece: 'pcs', pieces: 'pcs', mq: 'm²', m2: 'm²', 'm²': 'm²', ml: 'm', lm: 'm', kg: 'kg' } as Record<string, string>)[key] ?? key;
};
export interface DashboardBom { referenceTabId: string | null; customProductId: string | null; quantity: number; productUnit: string; quantitySource: string; material: { id: string; name: string; unit: string } }
export interface DashboardFilters { from?: string; to?: string; customerId?: string; status?: string }

export function buildDashboard(projects: Project[], customers: DashboardData['customers'], bom: DashboardBom[], filter: DashboardFilters, today = new Date().toISOString().slice(0, 10)): DashboardData {
  for (const value of [filter.from, filter.to]) if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new BadRequestException('Use a valid YYYY-MM-DD date');
  if (filter.status && !['all', 'draft', 'active'].includes(filter.status)) throw new BadRequestException('Unknown quotation status');
  const dates = projects.flatMap((project) => project.quotations.map((quotation) => quotation.date)).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort();
  const from = filter.from || dates[0] || today.slice(0, 7) + '-01';
  const to = filter.to || (dates.at(-1) && dates.at(-1)! > today ? dates.at(-1)! : today);
  if (from > to) throw new BadRequestException('Start date must be before end date');
  const months: DashboardData['months'] = [];
  for (let date = new Date(from.slice(0, 7) + '-01T00:00:00Z'); date.toISOString().slice(0, 7) <= to.slice(0, 7); date.setUTCMonth(date.getUTCMonth() + 1)) {
    if (months.length >= 120) throw new BadRequestException('Choose a date range of at most 10 years');
    months.push({ month: date.toISOString().slice(0, 7), quotations: 0, active: 0, draft: 0, estimatedCost: 0 });
  }
  const clients = new Map<string, DashboardData['clients'][number] & { projectIds: Set<string> }>();
  const products = new Map<string, DashboardData['products'][number] & { quotationIds: Set<string> }>();
  const materials = new Map<string, DashboardData['materials'][number] & { quotationIds: Set<string>; productIds: Set<string> }>();
  const links = new Map<string, DashboardBom[]>();
  for (const link of bom) { const id = link.referenceTabId ?? link.customProductId; if (id) links.set(id, [...(links.get(id) ?? []), link]); }
  let uncostedItems = 0; let unmappedLines = 0; let incompatibleLines = 0;
  const projectIds = new Set<string>();
  for (const project of projects) {
    if (filter.customerId && project.customerId !== filter.customerId) continue;
    for (const quotation of project.quotations) {
      if (quotation.date < from || quotation.date > to || (filter.status && filter.status !== 'all' && quotation.status !== filter.status)) continue;
      const monthIndex = months.findIndex((month) => month.month === quotation.date.slice(0, 7));
      if (monthIndex < 0) continue;
      const month = months[monthIndex]; month.quotations++; month[quotation.status]++;
      projectIds.add(project.id);
      const client = clients.get(project.customerId) ?? { id: project.customerId, name: project.customer, projects: 0, quotations: 0, estimatedCost: 0, trend: months.map(() => 0), projectIds: new Set<string>() };
      client.quotations++; client.projectIds.add(project.id); client.trend[monthIndex]++; clients.set(client.id, client);
      for (const item of quotation.items) {
        const rate = item.productUnitCost !== undefined ? item.productUnitCost : (item.unitCostOverride ?? item.historicalUnitCost); // labour and transport are quoted separately
        const cost = rate == null ? 0 : rate * item.quantity;
        if (rate == null) uncostedItems++;
        month.estimatedCost += cost; client.estimatedCost += cost;
        const id = item.referenceTabId ?? item.catalogId;
        const unit = normalizedUnit(item.unit);
        const key = `${id ?? 'free:' + item.description.toLowerCase()}|${unit}`;
        const product = products.get(key) ?? { key, id, name: item.description.split(/\r?\n/)[0], unit, quantity: 0, quotations: 0, estimatedCost: 0, trend: months.map(() => 0), quotationIds: new Set<string>() };
        product.quantity += item.quantity; product.estimatedCost += cost; product.trend[monthIndex] += item.quantity; product.quotationIds.add(quotation.id); products.set(key, product);
        const productLinks = id ? links.get(id) : undefined;
        if (!productLinks?.length) { unmappedLines++; continue; }
        let incompatible = false;
        for (const link of productLinks) {
          if (normalizedUnit(link.productUnit) !== unit) { incompatible = true; continue; }
          const quantity = link.quantity * item.quantity;
          const material = materials.get(link.material.id) ?? { id: link.material.id, name: link.material.name, unit: link.material.unit, quantity: 0, quotations: 0, products: 0, mockQuantity: 0, trend: months.map(() => 0), quotationIds: new Set<string>(), productIds: new Set<string>() };
          material.quantity += quantity; material.trend[monthIndex] += quantity; material.quotationIds.add(quotation.id); material.productIds.add(key);
          if (link.quantitySource === 'mock') material.mockQuantity += quantity;
          materials.set(material.id, material);
        }
        if (incompatible) incompatibleLines++;
      }
    }
  }
  const clientRows = [...clients.values()].map(({ projectIds, ...client }) => ({ ...client, projects: projectIds.size })).sort((a, b) => b.estimatedCost - a.estimatedCost || b.quotations - a.quotations);
  const productRows = [...products.values()].map(({ quotationIds, ...product }) => ({ ...product, quotations: quotationIds.size })).sort((a, b) => b.quotations - a.quotations || b.estimatedCost - a.estimatedCost);
  const materialRows = [...materials.values()].map(({ quotationIds, productIds, ...material }) => ({ ...material, quotations: quotationIds.size, products: productIds.size })).sort((a, b) => b.quotations - a.quotations || a.name.localeCompare(b.name));
  return { from, to, customers, months, clients: clientRows, products: productRows, materials: materialRows, totals: { customers: clients.size, projects: projectIds.size, quotations: months.reduce((sum, month) => sum + month.quotations, 0), active: months.reduce((sum, month) => sum + month.active, 0), draft: months.reduce((sum, month) => sum + month.draft, 0), estimatedCost: months.reduce((sum, month) => sum + month.estimatedCost, 0), uncostedItems, products: products.size, materials: materials.size, unmappedLines, incompatibleLines } };
}

@Injectable()
export class DashboardService {
  constructor(private readonly projects: ProjectsService, private readonly prisma: PrismaService) {}
  async get(ownerId: string, filters: DashboardFilters): Promise<DashboardData> {
    const [projects, customers] = await Promise.all([this.projects.list(ownerId), this.projects.listCustomers(ownerId)]);
    const productIds = [...new Set(projects.flatMap((project) => project.quotations.flatMap((quotation) => quotation.items.map((item) => item.referenceTabId ?? item.catalogId).filter((id): id is string => Boolean(id)))))];
    const bom = await this.prisma.productMaterial.findMany({ where: { OR: [{ referenceTabId: { in: productIds } }, { customProductId: { in: productIds } }] }, select: { referenceTabId: true, customProductId: true, quantity: true, productUnit: true, quantitySource: true, material: { select: { id: true, name: true, unit: true } } } });
    return buildDashboard(projects, customers, bom, filters);
  }
}
