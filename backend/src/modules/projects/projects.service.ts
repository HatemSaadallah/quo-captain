import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  AddItemDto,
  CreateProjectDto,
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
import { itemFromCatalog, validateProject, type NewItem } from './project.rules';

type ProjectRow = Prisma.ProjectGetPayload<{ include: { items: true; generations: true } }>;
type ItemRow = Prisma.ProjectItemGetPayload<Record<string, never>>;
type GenerationRow = Prisma.GenerationGetPayload<Record<string, never>>;

const INCLUDE = { items: { orderBy: { sortOrder: 'asc' } }, generations: { orderBy: { createdAt: 'desc' } } } as const;

function toItem(r: ItemRow): ProjectItem {
  return {
    id: r.id,
    catalogId: r.catalogId,
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
    dependsOnSheets: JSON.parse(r.dependsOnSheets) as string[],
    notes: r.notes,
  };
}

function toGeneration(g: GenerationRow): GenerationSummary {
  return { at: g.createdAt.toISOString(), file: g.file, reportFile: g.reportFile, status: g.status, engine: g.engine };
}

function toProject(p: ProjectRow): Project {
  return {
    id: p.id,
    name: p.name,
    customer: p.customer,
    reference: p.reference,
    date: p.date,
    estimator: p.estimator,
    templateWorkbook: p.templateWorkbook,
    items: p.items.map(toItem),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    generations: p.generations.map(toGeneration),
  };
}

function itemData(it: NewItem): Prisma.ProjectItemCreateWithoutProjectInput {
  return {
    catalogId: it.catalogId,
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
    dependsOnSheets: JSON.stringify(it.dependsOnSheets),
    notes: it.notes,
  };
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  async list(): Promise<Project[]> {
    const rows = await this.prisma.project.findMany({ include: INCLUDE, orderBy: { updatedAt: 'desc' } });
    return rows.map(toProject);
  }

  async get(id: string): Promise<Project> {
    const row = await this.prisma.project.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw new NotFoundException(`Project ${id} not found`);
    return toProject(row);
  }

  async create(input: CreateProjectDto): Promise<Project> {
    const name = String(input.name ?? '').trim();
    if (!name) throw new BadRequestException('name is required');
    const templates = this.catalog.workbooks.map((w) => w.workbook);
    const templateWorkbook = String(input.templateWorkbook ?? templates[0] ?? '');
    if (templateWorkbook && !templates.includes(templateWorkbook)) throw new BadRequestException(`Unknown template workbook ${templateWorkbook}`);
    const row = await this.prisma.project.create({
      data: {
        name,
        customer: String(input.customer ?? '').trim(),
        reference: String(input.reference ?? '').trim(),
        date: String(input.date ?? new Date().toISOString().slice(0, 10)),
        estimator: String(input.estimator ?? '').trim(),
        templateWorkbook,
      },
      include: INCLUDE,
    });
    return toProject(row);
  }

  async update(id: string, patch: UpdateProjectDto): Promise<Project> {
    await this.get(id);
    const data: Prisma.ProjectUpdateInput = {};
    for (const k of ['name', 'customer', 'reference', 'date', 'estimator', 'templateWorkbook'] as const) {
      const v = patch[k];
      if (v !== undefined) data[k] = String(v).trim();
    }
    if (data.templateWorkbook && !this.catalog.workbooks.some((w) => w.workbook === data.templateWorkbook)) {
      throw new BadRequestException(`Unknown template workbook ${String(data.templateWorkbook)}`);
    }
    const row = await this.prisma.project.update({ where: { id }, data, include: INCLUDE });
    return toProject(row);
  }

  async delete(id: string): Promise<void> {
    await this.get(id);
    await this.prisma.project.delete({ where: { id } });
  }

  async addItem(id: string, input: AddItemDto): Promise<Project> {
    await this.get(id);
    const rec = this.catalog.get(input.catalogId);
    const { catalogId: _ignored, quantity, ...overrides } = input;
    const q = quantity === undefined ? (rec.quantity ?? 1) : Number(quantity);
    const agg = await this.prisma.projectItem.aggregate({ where: { projectId: id }, _max: { sortOrder: true } });
    const item = itemFromCatalog(rec, q, overrides);
    await this.prisma.projectItem.create({ data: { ...itemData(item), sortOrder: (agg._max.sortOrder ?? 0) + 1, project: { connect: { id } } } });
    await this.touch(id);
    return this.get(id);
  }

  async updateItem(id: string, itemId: string, patch: UpdateItemDto): Promise<Project> {
    const row = await this.prisma.projectItem.findFirst({ where: { id: itemId, projectId: id } });
    if (!row) throw new NotFoundException(`Item ${itemId} not found`);
    const data: Prisma.ProjectItemUpdateInput = {};
    for (const k of ['position', 'itemCode', 'description', 'unit', 'notes'] as const) if (patch[k] !== undefined) data[k] = String(patch[k]);
    if (patch.quantity !== undefined) data.quantity = Number(patch.quantity);
    if (patch.L !== undefined) data.L = patch.L === null ? null : Number(patch.L);
    if (patch.H !== undefined) data.H = patch.H === null ? null : Number(patch.H);
    if (patch.lotto !== undefined) data.lotto = patch.lotto;
    if (patch.params) {
      const params = JSON.parse(row.params) as ItemParam[];
      for (const np of patch.params) {
        const cur = params.find((x) => x.cell === np.cell);
        if (!cur) continue;
        if (np.value === '' || np.value === null) cur.value = null;
        else cur.value = typeof cur.original === 'number' ? Number(np.value) : np.value;
      }
      data.params = JSON.stringify(params);
    }
    await this.prisma.projectItem.update({ where: { id: itemId }, data });
    await this.touch(id);
    return this.get(id);
  }

  async removeItem(id: string, itemId: string): Promise<Project> {
    const res = await this.prisma.projectItem.deleteMany({ where: { id: itemId, projectId: id } });
    if (!res.count) throw new NotFoundException(`Item ${itemId} not found`);
    await this.touch(id);
    return this.get(id);
  }

  async validate(id: string): Promise<ProjectValidation> {
    const p = await this.get(id);
    return this.validateProject(p);
  }

  validateProject(p: Project): ProjectValidation {
    return validateProject(p, this.catalog.workbooks.find((w) => w.workbook === p.templateWorkbook) ?? null);
  }

  async recordGeneration(id: string, g: Omit<GenerationSummary, 'at'>): Promise<void> {
    await this.prisma.generation.create({ data: { projectId: id, file: g.file, reportFile: g.reportFile, status: g.status, engine: g.engine } });
  }

  private async touch(id: string): Promise<void> {
    await this.prisma.project.update({ where: { id }, data: { updatedAt: new Date() } });
  }
}
