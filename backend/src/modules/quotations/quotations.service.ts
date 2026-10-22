import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { SearchHit } from '../../common/interfaces/catalog.interface';
import type {
  AddItemDto,
  AddRowDto,
  AttachTabDto,
  CreateQuotationDto,
  ElencoCosti,
  GenerationSummary,
  ItemParam,
  Quotation,
  QuotationItem,
  QuotationValidation,
  UpdateItemDto,
  UpdateQuotationDto,
} from '../../common/interfaces/quotation.interface';
import type { Benchmark, BenchmarkCategoryRow, BenchmarkExample, GridSheet, WorkbookView } from '../../common/interfaces/workbook-view.interface';
import { EC } from '../../excel/somec-schema';
import { CatalogService } from '../catalog/catalog.service';
import { CostingService } from '../costing/costing.service';
import { PrismaService } from '../prisma/prisma.service';
import { computeElencoCosti, unitsCompatible, type ComputedUnitCost } from './elenco-costi';
import { elencoCostiPdf } from './pdf';
import { analysisSheet, elencoCostiSheet } from './workbook-view';
import { attachTab, blankRow, itemFromCatalog, validateQuotation, type NewItem } from './quotation.rules';

type QuotationRow = Prisma.QuotationGetPayload<{ include: { items: true; generations: true; project: { include: { customer: true } } } }>;
type ItemRow = Prisma.QuotationItemGetPayload<Record<string, never>>;
type GenerationRow = Prisma.GenerationGetPayload<Record<string, never>>;

const INCLUDE = { items: { orderBy: { sortOrder: 'asc' } }, generations: { orderBy: { createdAt: 'desc' } }, project: { include: { customer: true } } } as const;

function toItem(r: ItemRow): QuotationItem {
  return {
    id: r.id,
    catalogId: r.catalogId,
    referenceTabId: r.referenceTabId,
    sourceWorkbook: r.sourceWorkbook,
    sourceSheet: r.sourceSheet,
    sourceOfferNo: r.sourceOfferNo,
    position: r.position,
    itemCode: r.itemCode,
    description: r.description,
    unit: r.unit,
    quantity: r.quantity,
    L: r.L,
    H: r.H,
    lotto: r.lotto,
    params: JSON.parse(r.params) as ItemParam[],
    historicalUnitCost: r.historicalUnitCost,
    historicalQuantity: r.historicalQuantity,
    unitCostOverride: r.unitCostOverride,
    dependsOnSheets: JSON.parse(r.dependsOnSheets) as string[],
    notes: r.notes,
  };
}

function requirePositive(v: unknown, field: string): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (typeof v === 'boolean' || v === '' || v === null || !Number.isFinite(n) || n <= 0) throw new BadRequestException(`${field} must be a positive number`);
  return n;
}

function requireText(v: unknown, field: string): string {
  if (typeof v !== 'string') throw new BadRequestException(`${field} must be a string`);
  if (v.length > 4000) throw new BadRequestException(`${field} is too long`);
  return v.trim();
}

function optionalPositive(v: unknown, field: string): number | null {
  return v === null || v === undefined || v === '' ? null : requirePositive(v, field);
}

function toGeneration(g: GenerationRow): GenerationSummary {
  return { at: g.createdAt.toISOString(), file: g.file, reportFile: g.reportFile, status: g.status, engine: g.engine };
}

function toQuotation(p: QuotationRow): Quotation {
  if (!p.project) throw new Error(`Quotation ${p.id} has no project`);
  return {
    id: p.id,
    ownerId: p.ownerId,
    projectId: p.projectId!,
    projectName: p.project.name,
    name: p.name,
    customer: p.project.customer.name,
    reference: p.reference,
    date: p.date,
    estimator: p.estimator,
    templateWorkbook: p.templateWorkbook,
    status: p.status === 'active' ? 'active' : 'draft',
    items: p.items.map(toItem),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    generations: p.generations.map(toGeneration),
  };
}

function itemData(it: NewItem): Prisma.QuotationItemUncheckedCreateWithoutQuotationInput {
  return {
    catalogId: it.catalogId,
    referenceTabId: it.referenceTabId,
    sourceWorkbook: it.sourceWorkbook,
    sourceSheet: it.sourceSheet,
    sourceOfferNo: it.sourceOfferNo,
    position: it.position,
    itemCode: it.itemCode,
    description: it.description,
    unit: it.unit,
    quantity: it.quantity,
    L: it.L,
    H: it.H,
    lotto: it.lotto,
    params: JSON.stringify(it.params),
    historicalUnitCost: it.historicalUnitCost,
    historicalQuantity: it.historicalQuantity,
    unitCostOverride: it.unitCostOverride,
    dependsOnSheets: JSON.stringify(it.dependsOnSheets),
    notes: it.notes,
  };
}

/** Every method is scoped to the authenticated user: a quotation is only visible to its owner. */
/** Cost-breakdown categories that are labour or transport, and line descriptions that quote them separately. */
const LABOUR = /INSTALLAZIONE DI CANTIERE|GESTIONE DI CANTIERE|VIAGGI E TRASFERTE/i;
const TRANSPORT = /TRASPORT/i;
const LABOUR_LINE = /^\s*(labou?r|installation|manodopera|installazione|posa in opera|montaggio|site management)/i;
const TRANSPORT_LINE = /^\s*(transport|trasport|freight|shipping|delivery|logistic)/i;

@Injectable()
export class QuotationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly costing: CostingService,
  ) {}

  async list(userId: string): Promise<Quotation[]> {
    const rows = await this.prisma.quotation.findMany({ where: { ownerId: userId }, include: INCLUDE, orderBy: { updatedAt: 'desc' } });
    return rows.map(toQuotation);
  }

  async get(id: string, userId: string): Promise<Quotation> {
    const row = await this.prisma.quotation.findFirst({ where: { id, ownerId: userId }, include: INCLUDE });
    if (!row) throw new NotFoundException(`Quotation ${id} not found`);
    return toQuotation(row);
  }

  async create(input: CreateQuotationDto, userId: string): Promise<Quotation> {
    const name = requireText(input.name ?? '', 'name');
    if (!name) throw new BadRequestException('name is required');
    const templates = this.catalog.workbooks.map((w) => w.workbook);
    const templateWorkbook = requireText(input.templateWorkbook ?? '', 'templateWorkbook');
    if (templateWorkbook && !templates.includes(templateWorkbook)) throw new BadRequestException(`Unknown template workbook ${templateWorkbook}`);
    const project = await this.prisma.project.findFirst({ where: { id: input.projectId, ownerId: userId }, include: { customer: true } });
    if (!project) throw new BadRequestException('A project attached to a customer is required');
    const row = await this.prisma.quotation.create({
      data: {
        ownerId: userId,
        name,
        customer: project.customer.name,
        projectId: project.id,
        reference: requireText(input.reference ?? '', 'reference'),
        date: requireText(input.date ?? new Date().toISOString().slice(0, 10), 'date'),
        estimator: requireText(input.estimator ?? '', 'estimator'),
        templateWorkbook,
      },
      include: INCLUDE,
    });
    return toQuotation(row);
  }

  async update(id: string, patch: UpdateQuotationDto, userId: string): Promise<Quotation> {
    await this.get(id, userId);
    const data: Prisma.QuotationUpdateInput = {};
    for (const k of ['name', 'reference', 'date', 'estimator', 'templateWorkbook'] as const) {
      const v = patch[k];
      if (v !== undefined) data[k] = requireText(v, k);
    }
    if (patch.projectId !== undefined) {
      const project = await this.prisma.project.findFirst({ where: { id: patch.projectId, ownerId: userId }, include: { customer: true } });
      if (!project) throw new BadRequestException('Project not found');
      data.project = { connect: { id: project.id } };
      data.customer = project.customer.name;
    }
    if (data.templateWorkbook && !this.catalog.workbooks.some((w) => w.workbook === data.templateWorkbook)) {
      throw new BadRequestException(`Unknown template workbook ${String(data.templateWorkbook)}`);
    }
    if (patch.status !== undefined) {
      if (patch.status !== 'draft' && patch.status !== 'active') throw new BadRequestException('status must be draft or active');
      data.status = patch.status;
    }
    const row = await this.prisma.quotation.update({ where: { id }, data, include: INCLUDE });
    return toQuotation(row);
  }

  async delete(id: string, userId: string): Promise<void> {
    await this.get(id, userId);
    await this.prisma.quotation.delete({ where: { id } });
  }

  private async nextSortOrder(quotationId: string): Promise<number> {
    const agg = await this.prisma.quotationItem.aggregate({ where: { quotationId }, _max: { sortOrder: true } });
    return (agg._max.sortOrder ?? 0) + 1;
  }

  /** FK to ReferenceTab only when the tab is stored in the database (otherwise provenance stays in the row). */
  private async referenceTabIdFor(catalogId: string | null): Promise<string | null> {
    if (!catalogId) return null;
    const t = await this.prisma.referenceTab.findUnique({ where: { id: catalogId }, select: { id: true } });
    return t?.id ?? null;
  }

  /** Add a historical analysis (reference tab) as a cost row. */
  async addItem(id: string, input: AddItemDto, userId: string): Promise<Quotation> {
    await this.get(id, userId);
    if (!input || typeof input.catalogId !== 'string') throw new BadRequestException('catalogId is required');
    const rec = this.catalog.get(input.catalogId);
    // Only these fields may be customised by the caller; provenance, params and historical
    // cost always come from the catalog record (whitelist, not a spread of the body).
    const overrides: Partial<NewItem> = {};
    for (const k of ['position', 'itemCode', 'description', 'unit', 'notes'] as const) {
      const v = input[k];
      if (v !== undefined) overrides[k] = requireText(v, k);
    }
    const q = input.quantity === undefined ? (rec.quantity ?? 1) : requirePositive(input.quantity, 'quantity');
    const item = rec.custom
      ? blankRow({ position: undefined, itemCode: rec.itemCode ?? undefined, description: rec.description ?? rec.title ?? '', unit: rec.unit ?? undefined, quantity: q, L: rec.L, H: rec.H })
      : itemFromCatalog(rec, q, overrides);
    item.referenceTabId = await this.referenceTabIdFor(item.catalogId);
    await this.prisma.quotationItem.create({ data: { ...itemData(item), sortOrder: await this.nextSortOrder(id), quotationId: id } });
    await this.touch(id);
    return this.get(id, userId);
  }

  /** Add a free ELENCO COSTI row (from the customer's BOQ) with no reference tab yet. */
  async addRow(id: string, input: AddRowDto, userId: string): Promise<Quotation> {
    await this.get(id, userId);
    const row = blankRow({
      position: input.position === undefined ? undefined : requireText(input.position, 'position'),
      itemCode: input.itemCode === undefined ? undefined : requireText(input.itemCode, 'itemCode'),
      description: requireText(input.description, 'description'),
      unit: input.unit === undefined ? undefined : requireText(input.unit, 'unit'),
      quantity: requirePositive(input.quantity, 'quantity'),
      L: optionalPositive(input.L, 'L'),
      H: optionalPositive(input.H, 'H'),
      lotto: input.lotto === undefined || input.lotto === null ? null : requireText(input.lotto, 'lotto'),
    });
    if (!row.description) throw new BadRequestException('description is required');
    await this.prisma.quotationItem.create({ data: { ...itemData(row), sortOrder: await this.nextSortOrder(id), quotationId: id } });
    await this.touch(id);
    return this.get(id, userId);
  }

  /** Reference tabs that resemble this row (by its description and dimensions). */
  async suggestions(id: string, itemId: string, userId: string, limit = 6): Promise<SearchHit[]> {
    const p = await this.get(id, userId);
    const it = p.items.find((x) => x.id === itemId);
    if (!it) throw new NotFoundException(`Item ${itemId} not found`);
    const dims = it.L && it.H ? ` ${it.L}x${it.H}` : '';
    const q = `${it.description.split(/\r?\n/)[0]}${dims}`.trim();
    if (!q) return [];
    const { hits } = await this.catalog.search({ q, limit: Math.min(Math.max(limit, 1), 20) });
    return hits.filter((h) => h.record.sheet !== null);
  }

  /** Attach a reference tab to a row: provenance, parameters and historical unit cost come from the tab. */
  async attach(id: string, itemId: string, input: AttachTabDto, userId: string): Promise<Quotation> {
    const p = await this.get(id, userId);
    const it = p.items.find((x) => x.id === itemId);
    if (!it) throw new NotFoundException(`Item ${itemId} not found`);
    if (!input || typeof input.referenceTabId !== 'string') throw new BadRequestException('referenceTabId is required');
    const tab = this.catalog.get(input.referenceTabId);
    if (!tab.sheet) throw new BadRequestException(`Reference tab ${tab.id} has no analysis sheet in its workbook`);
    if (!input.overwrite && it.unit.trim() && !unitsCompatible(it.unit, tab.unit)) {
      throw new BadRequestException(`Row unit "${it.unit}" is not compatible with the reference tab's unit "${tab.unit ?? '?'}" (its unit cost is per ${tab.unit ?? '?'}); change the row unit, pick another tab, or attach with overwrite=true to take the tab's unit`);
    }
    const merged = attachTab(it, tab, input.overwrite === true);
    merged.referenceTabId = await this.referenceTabIdFor(tab.id);
    const { sortOrder: _s, ...data } = { ...itemData(merged), sortOrder: 0 };
    await this.prisma.quotationItem.update({ where: { id: itemId }, data });
    await this.touch(id);
    return this.get(id, userId);
  }

  /** Detach the reference tab: the row becomes a free row again (keeps its text, quantity, dims and override). */
  async detach(id: string, itemId: string, userId: string): Promise<Quotation> {
    const p = await this.get(id, userId);
    const it = p.items.find((x) => x.id === itemId);
    if (!it) throw new NotFoundException(`Item ${itemId} not found`);
    await this.prisma.quotationItem.update({
      where: { id: itemId },
      data: { catalogId: null, referenceTabId: null, sourceWorkbook: null, sourceSheet: null, sourceOfferNo: null, params: '[]', historicalUnitCost: null, historicalQuantity: null, dependsOnSheets: '[]' },
    });
    await this.touch(id);
    return this.get(id, userId);
  }

  async updateItem(id: string, itemId: string, patch: UpdateItemDto, userId: string): Promise<Quotation> {
    await this.get(id, userId);
    const row = await this.prisma.quotationItem.findFirst({ where: { id: itemId, quotationId: id } });
    if (!row) throw new NotFoundException(`Item ${itemId} not found`);
    const data: Prisma.QuotationItemUpdateInput = {};
    for (const k of ['position', 'itemCode', 'description', 'unit', 'notes'] as const) if (patch[k] !== undefined) data[k] = requireText(patch[k], k);
    if (patch.unit !== undefined && row.catalogId && this.catalog.has(row.catalogId)) {
      const tabUnit = this.catalog.get(row.catalogId).unit;
      if (!unitsCompatible(String(data.unit ?? ''), tabUnit)) throw new BadRequestException(`Unit "${String(data.unit)}" is not compatible with the attached reference tab (unit cost per ${tabUnit ?? '?'}); detach the tab first or keep a compatible unit`);
    }
    if (patch.quantity !== undefined) data.quantity = requirePositive(patch.quantity, 'quantity');
    if (patch.L !== undefined) data.L = optionalPositive(patch.L, 'L');
    if (patch.H !== undefined) data.H = optionalPositive(patch.H, 'H');
    if (patch.lotto !== undefined) data.lotto = patch.lotto === null ? null : requireText(patch.lotto, 'lotto');
    if (patch.unitCostOverride !== undefined) data.unitCostOverride = optionalPositive(patch.unitCostOverride, 'unitCostOverride');
    if (patch.params) {
      if (!Array.isArray(patch.params)) throw new BadRequestException('params must be an array of {cell, value}');
      const params = JSON.parse(row.params) as ItemParam[];
      for (const np of patch.params) {
        const cur = params.find((x) => x.cell === np.cell);
        if (!cur) throw new BadRequestException(`Parameter ${String(np.cell)} is not editable for this item`);
        if (np.value === '' || np.value === null || np.value === undefined) cur.value = null;
        else if (typeof cur.original === 'number' || cur.unit === 'MM') cur.value = requirePositive(np.value, `parameter ${cur.label}`);
        else cur.value = requireText(np.value, `parameter ${cur.label}`);
      }
      data.params = JSON.stringify(params);
    }
    await this.prisma.quotationItem.update({ where: { id: itemId }, data });
    await this.touch(id);
    return this.get(id, userId);
  }

  async removeItem(id: string, itemId: string, userId: string): Promise<Quotation> {
    await this.get(id, userId);
    const res = await this.prisma.quotationItem.deleteMany({ where: { id: itemId, quotationId: id } });
    if (!res.count) throw new NotFoundException(`Item ${itemId} not found`);
    await this.touch(id);
    return this.get(id, userId);
  }

  async validate(id: string, userId: string): Promise<QuotationValidation> {
    return this.validateQuotation(await this.get(id, userId));
  }

  validateQuotation(p: Quotation): QuotationValidation {
    return validateQuotation(p, this.catalog.workbooks.find((w) => w.workbook === p.templateWorkbook) ?? null, (id) => (this.catalog.has(id) ? this.catalog.get(id).unit : undefined));
  }

  /** The web ELENCO COSTI: the sheet's own formulas applied to the quotation's rows; J from the app engine when the tab's logic is stored. */
  async elencoCosti(id: string, userId: string): Promise<ElencoCosti> {
    const p = await this.get(id, userId);
    const computed = new Map<string, ComputedUnitCost | null>();
    // Labour (site installation, site management, travel) and transport are quoted as their own lines,
    // so each product line drops that share of its analysis' cost breakdown. Manual prices are left as typed.
    let labour = 0;
    let transport = 0;
    const items = [];
    for (const it of p.items) {
      const rec = it.catalogId && this.catalog.has(it.catalogId) ? this.catalog.get(it.catalogId) : null;
      const parts = rec?.costBreakdown ?? [];
      const all = parts.reduce((acc, b) => acc + (b.unitCost ?? 0), 0);
      const share = (re: RegExp): number => (all > 0 ? parts.filter((b) => re.test(b.category)).reduce((acc, b) => acc + (b.unitCost ?? 0), 0) / all : 0);
      const labourShare = share(LABOUR);
      const transportShare = share(TRANSPORT);
      const keep = 1 - labourShare - transportShare;
      let unit: number | null = it.historicalUnitCost;
      if (it.catalogId && it.unitCostOverride === null) {
        const c = await this.costing.compute(it);
        const cu = c && c.unitCost !== null && c.unsupported === 0 ? c.unitCost : null;
        unit = cu ?? it.historicalUnitCost;
        computed.set(it.id, c ? { unitCost: c.unitCost === null ? null : c.unitCost * keep, fidelity: c.fidelity, errors: c.errors, unsupported: c.unsupported } : null);
      }
      if (it.unitCostOverride === null && unit !== null) {
        labour += unit * labourShare * it.quantity;
        transport += unit * transportShare * it.quantity;
      }
      items.push(it.unitCostOverride === null && it.historicalUnitCost !== null ? { ...it, historicalUnitCost: it.historicalUnitCost * keep } : it);
    }
    const ec = computeElencoCosti({ ...p, items }, computed);
    // Only the line title counts: product specs often say "supply and installation of…".
    const text = (it: (typeof p.items)[number]): string => (it.catalogId ? '' : it.description.split(/\r?\n/)[0]);
    ec.separate = {
      labour: Math.round(labour * 100) / 100,
      transport: Math.round(transport * 100) / 100,
      hasLabourLine: p.items.some((it) => LABOUR_LINE.test(text(it))),
      hasTransportLine: p.items.some((it) => TRANSPORT_LINE.test(text(it))),
    };
    return ec;
  }

  /** The generated quotation as a clickable web workbook: ELENCO COSTI + one evaluated analysis sheet per row. */
  async workbookView(id: string, userId: string): Promise<WorkbookView> {
    const p = await this.get(id, userId);
    const ec = await this.elencoCosti(id, userId);
    const sheets: GridSheet[] = [elencoCostiSheet(p, ec)];
    for (let i = 0; i < p.items.length; i++) {
      const it = p.items[i];
      if (!it.catalogId) continue;
      const grid = await this.costing.grid(it);
      if (grid) sheets.push(analysisSheet(it, EC.firstRow + i, grid, `${it.itemCode} ${it.description.split(/\r?\n/)[0]}`));
    }
    return { quotationId: p.id, reference: p.reference, generatedAt: new Date().toISOString(), sheets };
  }

  async elencoCostiPdf(id: string, userId: string): Promise<{ file: string; buffer: Buffer }> {
    const p = await this.get(id, userId);
    const ec = await this.elencoCosti(id, userId);
    return { file: `${p.reference || 'quotation'} ELENCO COSTI.pdf`, buffer: await elencoCostiPdf(p, ec) };
  }

  /** Historical benchmarking for one row: comparable analyses, their specs/dates/sources and category cost comparison. */
  async benchmark(id: string, itemId: string, userId: string, limit = 6): Promise<Benchmark> {
    const p = await this.get(id, userId);
    const it = p.items.find((x) => x.id === itemId);
    if (!it) throw new NotFoundException(`Item ${itemId} not found`);
    const query = `${it.description.split(/\r?\n/)[0]}${it.L && it.H ? ` ${it.L}x${it.H}` : ''}`.trim();
    const hits = it.catalogId && this.catalog.has(it.catalogId) ? await this.catalog.similar(it.catalogId, limit) : (await this.catalog.search({ q: query, limit })).hits;
    const examples: BenchmarkExample[] = hits.map((h) => ({
      id: h.record.id,
      title: h.record.title,
      offerNo: h.record.offerNo,
      workbook: h.record.workbook,
      sheet: h.record.sheet,
      client: h.record.client,
      projectDate: h.record.projectDate,
      itemCode: h.record.itemCode,
      unit: h.record.unit,
      quantity: h.record.quantity,
      L: h.record.L,
      H: h.record.H,
      unitCost: h.record.unitCost,
      params: h.record.params.filter((x) => x.editable).map((x) => ({ label: x.label, value: x.value, unit: x.unit })),
      similarity: Math.min(1, h.score),
      sourceCell: h.record.sourceCells.unitCost ?? null,
    }));
    const own = it.catalogId && this.catalog.has(it.catalogId) ? this.catalog.get(it.catalogId) : null;
    const computed = it.catalogId ? await this.costing.compute(it) : null;
    const ownBreakdown = computed?.breakdown.map((b) => ({ category: b.label, code: b.category, unitCost: b.unitCost })) ?? own?.costBreakdown.map((b) => ({ category: b.category, code: b.code, unitCost: b.unitCost })) ?? [];
    const codes = new Map<string, string>();
    for (const b of ownBreakdown) codes.set(b.code, b.category);
    for (const h of hits) for (const b of h.record.costBreakdown) if (!codes.has(b.code)) codes.set(b.code, b.category);
    const categories: BenchmarkCategoryRow[] = [...codes].map(([code, category]) => ({
      category,
      code,
      own: ownBreakdown.find((b) => b.code === code)?.unitCost ?? null,
      comparables: hits.map((h) => h.record.costBreakdown.find((b) => b.code === code)?.unitCost ?? null),
    }));
    const byWb = new Map<string, number>();
    for (const h of hits) byWb.set(h.record.workbook, (byWb.get(h.record.workbook) ?? 0) + 1);
    const quotations = [...byWb]
      .map(([workbook, matches]) => {
        const w = this.catalog.workbooks.find((x) => x.workbook === workbook);
        return { workbook, offerNo: w?.offerNo ?? null, client: w?.client ?? null, projectName: w?.projectName ?? null, projectDate: w?.projectDate ?? null, matches };
      })
      .sort((a, b) => b.matches - a.matches);
    const costs = examples.map((e) => e.unitCost).filter((v): v is number => v !== null).sort((a, b) => a - b);
    const ownCost = computed?.unitCost ?? it.unitCostOverride ?? it.historicalUnitCost;
    return { itemId, query, examples, categories, quotations, stats: { min: costs[0] ?? null, median: costs.length ? costs[Math.floor(costs.length / 2)] : null, max: costs[costs.length - 1] ?? null, own: ownCost, unit: own?.unit ?? it.unit } };
  }

  async recordGeneration(id: string, g: Omit<GenerationSummary, 'at'>): Promise<void> {
    await this.prisma.generation.create({ data: { quotationId: id, file: g.file, reportFile: g.reportFile, status: g.status, engine: g.engine } });
  }

  private async touch(id: string): Promise<void> {
    await this.prisma.quotation.update({ where: { id }, data: { updatedAt: new Date() } });
  }
}
