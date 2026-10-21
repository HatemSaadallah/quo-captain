import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { SearchHit } from '../../common/interfaces/catalog.interface';
import type {
  AddItemDto,
  AddRowDto,
  AttachTabDto,
  CreateProjectDto,
  ElencoCosti,
  GenerationSummary,
  ItemParam,
  Project,
  ProjectItem,
  ProjectValidation,
  UpdateItemDto,
  UpdateProjectDto,
} from '../../common/interfaces/project.interface';
import { CatalogService } from '../catalog/catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { computeElencoCosti, sameCostUnit } from './elenco-costi';
import { attachTab, blankRow, itemFromCatalog, validateProject, type NewItem } from './project.rules';

type ProjectRow = Prisma.ProjectGetPayload<{ include: { items: true; generations: true } }>;
type ItemRow = Prisma.ProjectItemGetPayload<Record<string, never>>;
type GenerationRow = Prisma.GenerationGetPayload<Record<string, never>>;

const INCLUDE = { items: { orderBy: { sortOrder: 'asc' } }, generations: { orderBy: { createdAt: 'desc' } } } as const;

function toItem(r: ItemRow, catalog: CatalogService): ProjectItem {
  let historicalUnit: string | null = null;
  if (r.catalogId) {
    try { historicalUnit = catalog.get(r.catalogId).unit; } catch { /* An unavailable reference has no trusted cost unit. */ }
  }
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
    historicalUnit,
    historicalCostCompatible: historicalUnit !== null && sameCostUnit(r.unit, historicalUnit),
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

function toProject(p: ProjectRow, catalog: CatalogService): Project {
  return {
    id: p.id,
    ownerId: p.ownerId,
    name: p.name,
    customer: p.customer,
    reference: p.reference,
    date: p.date,
    estimator: p.estimator,
    templateWorkbook: p.templateWorkbook,
    items: p.items.map((item) => toItem(item, catalog)),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    generations: p.generations.map(toGeneration),
  };
}

function itemData(it: NewItem): Prisma.ProjectItemUncheckedCreateWithoutProjectInput {
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

/** Every method is scoped to the authenticated user: a project is only visible to its owner. */
@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  async list(userId: string): Promise<Project[]> {
    const rows = await this.prisma.project.findMany({ where: { ownerId: userId }, include: INCLUDE, orderBy: { updatedAt: 'desc' } });
    return rows.map((row) => toProject(row, this.catalog));
  }

  /** Only recorded output files belonging to this user's projects may be served. */
  async generationFiles(userId: string): Promise<string[]> {
    const rows = await this.prisma.generation.findMany({
      where: { project: { ownerId: userId } },
      select: { file: true, reportFile: true },
    });
    return rows.flatMap((row) => [row.file, row.reportFile]);
  }

  async get(id: string, userId: string): Promise<Project> {
    const row = await this.prisma.project.findFirst({ where: { id, ownerId: userId }, include: INCLUDE });
    if (!row) throw new NotFoundException(`Project ${id} not found`);
    return toProject(row, this.catalog);
  }

  async create(input: CreateProjectDto, userId: string): Promise<Project> {
    const name = requireText(input.name ?? '', 'name');
    if (!name) throw new BadRequestException('name is required');
    const templates = this.catalog.workbooks.map((w) => w.workbook);
    const templateWorkbook = String(input.templateWorkbook ?? templates[0] ?? '');
    if (templateWorkbook && !templates.includes(templateWorkbook)) throw new BadRequestException(`Unknown template workbook ${templateWorkbook}`);
    const row = await this.prisma.project.create({
      data: {
        ownerId: userId,
        name,
        customer: requireText(input.customer ?? '', 'customer'),
        reference: requireText(input.reference ?? '', 'reference'),
        date: requireText(input.date ?? new Date().toISOString().slice(0, 10), 'date'),
        estimator: requireText(input.estimator ?? '', 'estimator'),
        templateWorkbook,
      },
      include: INCLUDE,
    });
    return toProject(row, this.catalog);
  }

  async update(id: string, patch: UpdateProjectDto, userId: string): Promise<Project> {
    await this.get(id, userId);
    const data: Prisma.ProjectUpdateInput = {};
    for (const k of ['name', 'customer', 'reference', 'date', 'estimator', 'templateWorkbook'] as const) {
      const v = patch[k];
      if (v !== undefined) data[k] = requireText(v, k);
    }
    if (data.templateWorkbook && !this.catalog.workbooks.some((w) => w.workbook === data.templateWorkbook)) {
      throw new BadRequestException(`Unknown template workbook ${String(data.templateWorkbook)}`);
    }
    const row = await this.prisma.project.update({ where: { id }, data, include: INCLUDE });
    return toProject(row, this.catalog);
  }

  async delete(id: string, userId: string): Promise<void> {
    await this.get(id, userId);
    await this.prisma.project.delete({ where: { id } });
  }

  private async nextSortOrder(projectId: string): Promise<number> {
    const agg = await this.prisma.projectItem.aggregate({ where: { projectId }, _max: { sortOrder: true } });
    return (agg._max.sortOrder ?? 0) + 1;
  }

  /** FK to ReferenceTab only when the tab is stored in the database (otherwise provenance stays in the row). */
  private async referenceTabIdFor(catalogId: string | null): Promise<string | null> {
    if (!catalogId) return null;
    const t = await this.prisma.referenceTab.findUnique({ where: { id: catalogId }, select: { id: true } });
    return t?.id ?? null;
  }

  /** Add a historical analysis (reference tab) as a cost row. */
  async addItem(id: string, input: AddItemDto, userId: string): Promise<Project> {
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
    const item = itemFromCatalog(rec, q, overrides);
    item.referenceTabId = await this.referenceTabIdFor(item.catalogId);
    await this.prisma.projectItem.create({ data: { ...itemData(item), sortOrder: await this.nextSortOrder(id), projectId: id } });
    await this.touch(id);
    return this.get(id, userId);
  }

  /** Add a free ELENCO COSTI row (from the customer's BOQ) with no reference tab yet. */
  async addRow(id: string, input: AddRowDto, userId: string): Promise<Project> {
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
    await this.prisma.projectItem.create({ data: { ...itemData(row), sortOrder: await this.nextSortOrder(id), projectId: id } });
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
  async attach(id: string, itemId: string, input: AttachTabDto, userId: string): Promise<Project> {
    const p = await this.get(id, userId);
    const it = p.items.find((x) => x.id === itemId);
    if (!it) throw new NotFoundException(`Item ${itemId} not found`);
    if (!input || typeof input.referenceTabId !== 'string') throw new BadRequestException('referenceTabId is required');
    const tab = this.catalog.get(input.referenceTabId);
    if (!tab.sheet) throw new BadRequestException(`Reference tab ${tab.id} has no analysis sheet in its workbook`);
    const merged = attachTab(it, tab, input.overwrite === true);
    merged.referenceTabId = await this.referenceTabIdFor(tab.id);
    const { sortOrder: _s, ...data } = { ...itemData(merged), sortOrder: 0 };
    await this.prisma.projectItem.update({ where: { id: itemId }, data });
    await this.touch(id);
    return this.get(id, userId);
  }

  /** Detach the reference tab: the row becomes a free row again (keeps its text, quantity, dims and override). */
  async detach(id: string, itemId: string, userId: string): Promise<Project> {
    const p = await this.get(id, userId);
    const it = p.items.find((x) => x.id === itemId);
    if (!it) throw new NotFoundException(`Item ${itemId} not found`);
    await this.prisma.projectItem.update({
      where: { id: itemId },
      data: { catalogId: null, referenceTabId: null, sourceWorkbook: null, sourceSheet: null, sourceOfferNo: null, params: '[]', historicalUnitCost: null, historicalQuantity: null, dependsOnSheets: '[]' },
    });
    await this.touch(id);
    return this.get(id, userId);
  }

  async updateItem(id: string, itemId: string, patch: UpdateItemDto, userId: string): Promise<Project> {
    await this.get(id, userId);
    const row = await this.prisma.projectItem.findFirst({ where: { id: itemId, projectId: id } });
    if (!row) throw new NotFoundException(`Item ${itemId} not found`);
    const data: Prisma.ProjectItemUpdateInput = {};
    for (const k of ['position', 'itemCode', 'description', 'unit', 'notes'] as const) if (patch[k] !== undefined) data[k] = requireText(patch[k], k);
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
    await this.prisma.projectItem.update({ where: { id: itemId }, data });
    await this.touch(id);
    return this.get(id, userId);
  }

  async removeItem(id: string, itemId: string, userId: string): Promise<Project> {
    await this.get(id, userId);
    const res = await this.prisma.projectItem.deleteMany({ where: { id: itemId, projectId: id } });
    if (!res.count) throw new NotFoundException(`Item ${itemId} not found`);
    await this.touch(id);
    return this.get(id, userId);
  }

  async validate(id: string, userId: string): Promise<ProjectValidation> {
    return this.validateProject(await this.get(id, userId));
  }

  validateProject(p: Project): ProjectValidation {
    return validateProject(p, this.catalog.workbooks.find((w) => w.workbook === p.templateWorkbook) ?? null);
  }

  /** The web ELENCO COSTI: the sheet's own formulas applied to the project's rows. */
  async elencoCosti(id: string, userId: string): Promise<ElencoCosti> {
    return computeElencoCosti(await this.get(id, userId));
  }

  async recordGeneration(id: string, g: Omit<GenerationSummary, 'at'>): Promise<void> {
    await this.prisma.generation.create({ data: { projectId: id, file: g.file, reportFile: g.reportFile, status: g.status, engine: g.engine } });
  }

  private async touch(id: string): Promise<void> {
    await this.prisma.project.update({ where: { id }, data: { updatedAt: new Date() } });
  }
}
