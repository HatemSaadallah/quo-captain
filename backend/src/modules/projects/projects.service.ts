import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import { productUnitCost } from '../../common/utils/separate-costs';
import type { CreateProjectDto, Project, ProjectContact } from '../../common/interfaces/project.interface';
import type { Quotation } from '../../common/interfaces/quotation.interface';

const text = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(`${field} is required`);
  return value.trim();
};

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  async list(ownerId: string): Promise<Project[]> {
    const rows = await this.prisma.project.findMany({
      where: { ownerId },
      include: {
        customer: true,
        contacts: { include: { contact: true } },
        quotations: {
          include: { items: { orderBy: { sortOrder: 'asc' } }, generations: { orderBy: { createdAt: 'desc' } } },
          orderBy: { updatedAt: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((p) => ({
      id: p.id, name: p.name, brief: p.brief, customerId: p.customerId, customer: p.customer.name, contacts: p.contacts.map((pc) => pc.contact),
      quotations: p.quotations.map((q) => ({
        id: q.id, ownerId: q.ownerId, projectId: p.id, projectName: p.name, name: q.name, customer: p.customer.name, reference: q.reference,
        date: q.date, estimator: q.estimator, templateWorkbook: q.templateWorkbook, status: q.status === 'active' ? 'active' : 'draft',
        items: q.items.map((i) => ({
          id: i.id, catalogId: i.catalogId, referenceTabId: i.referenceTabId, sourceWorkbook: i.sourceWorkbook, sourceSheet: i.sourceSheet,
          sourceOfferNo: i.sourceOfferNo, position: i.position, itemCode: i.itemCode, description: i.description, unit: i.unit,
          quantity: i.quantity, L: i.L, H: i.H, lotto: i.lotto, params: JSON.parse(i.params), historicalUnitCost: i.historicalUnitCost,
          historicalQuantity: i.historicalQuantity, unitCostOverride: i.unitCostOverride, dependsOnSheets: JSON.parse(i.dependsOnSheets), notes: i.notes,
          productUnitCost: productUnitCost(i, this.catalog.costParts(i.catalogId)),
        })),
        createdAt: q.createdAt.toISOString(), updatedAt: q.updatedAt.toISOString(),
        generations: q.generations.map((g) => ({ at: g.createdAt.toISOString(), file: g.file, reportFile: g.reportFile, status: g.status, engine: g.engine })),
      } as Quotation)), createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(),
    }));
  }

  async create(input: CreateProjectDto, ownerId: string): Promise<Project> {
    const name = text(input.name, 'name');
    const customerName = text(input.customer, 'customer');
    const customer = await this.prisma.customer.upsert({
      where: { ownerId_name: { ownerId, name: customerName } }, update: {}, create: { ownerId, name: customerName },
    });
    const contactIds = Array.isArray(input.contactIds) ? [...new Set(input.contactIds.map((x) => text(x, 'contactIds')))] : [];
    if (!contactIds.length) throw new BadRequestException('At least one project contact is required');
    const contacts = await this.prisma.contact.findMany({ where: { id: { in: contactIds }, company: customer.name } });
    if (contacts.length !== contactIds.length) throw new BadRequestException('Select contacts belonging to the project customer');
    const row = await this.prisma.project.create({
      data: { ownerId, customerId: customer.id, name, contacts: { create: contactIds.map((contactId) => ({ contactId })) } },
      include: { customer: true, contacts: { include: { contact: true } } },
    });
    return { id: row.id, name: row.name, customerId: row.customerId, customer: row.customer.name, contacts: row.contacts.map((pc) => pc.contact), quotations: [], createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  }

  async listContacts(): Promise<ProjectContact[]> {
    return this.prisma.contact.findMany({ orderBy: [{ company: 'asc' }, { name: 'asc' }] });
  }

  async listCustomers(ownerId: string) {
    return this.prisma.customer.findMany({ where: { ownerId }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  }

  async update(id: string, input: CreateProjectDto, ownerId: string): Promise<Project> {
    await this.getOwned(id, ownerId);
    const name = text(input.name, 'name');
    const customerName = text(input.customer, 'customer');
    const contactIds = Array.isArray(input.contactIds) ? [...new Set(input.contactIds.map((value) => text(value, 'contactIds')))] : [];
    if (!contactIds.length) throw new BadRequestException('At least one project contact is required');
    const contacts = await this.prisma.contact.findMany({ where: { id: { in: contactIds }, company: customerName } });
    if (contacts.length !== contactIds.length) throw new BadRequestException('Select contacts belonging to the project customer');
    await this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.upsert({ where: { ownerId_name: { ownerId, name: customerName } }, update: {}, create: { ownerId, name: customerName } });
      await tx.project.update({ where: { id }, data: { name, customerId: customer.id } });
      await tx.projectContact.deleteMany({ where: { projectId: id } });
      await tx.projectContact.createMany({ data: contactIds.map((contactId) => ({ projectId: id, contactId })) });
      await tx.quotation.updateMany({ where: { projectId: id, ownerId }, data: { customer: customer.name } });
    });
    return (await this.list(ownerId)).find((project) => project.id === id)!;
  }

  async updateContacts(id: string, input: unknown, ownerId: string): Promise<Project> {
    const project = await this.getOwned(id, ownerId);
    const contactIds = Array.isArray(input) ? [...new Set(input.map((value) => text(value, 'contactIds')))] : [];
    if (!contactIds.length) throw new BadRequestException('At least one project contact is required');
    const contacts = await this.prisma.contact.findMany({ where: { id: { in: contactIds }, company: project.customer.name } });
    if (contacts.length !== contactIds.length) throw new BadRequestException('Select contacts belonging to the project customer');
    await this.prisma.$transaction([
      this.prisma.projectContact.deleteMany({ where: { projectId: id } }),
      this.prisma.projectContact.createMany({ data: contactIds.map((contactId) => ({ projectId: id, contactId })) }),
    ]);
    const updated = await this.prisma.project.findUniqueOrThrow({ where: { id }, include: { customer: true, contacts: { include: { contact: true } } } });
    return { id: updated.id, name: updated.name, customerId: updated.customerId, customer: updated.customer.name, contacts: updated.contacts.map((pc) => pc.contact), quotations: [], createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() };
  }

  async getOwned(id: string, ownerId: string) {
    const row = await this.prisma.project.findFirst({ where: { id, ownerId }, include: { customer: true } });
    if (!row) throw new NotFoundException(`Project ${id} not found`);
    return row;
  }
}
