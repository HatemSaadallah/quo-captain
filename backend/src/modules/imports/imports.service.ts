import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { extractWorkbook } from '../../excel/catalog-extractor';
import type { AuthUser } from '../../common/interfaces/auth.interface';
import { CatalogService } from '../catalog/catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { QuotationsService } from '../quotations/quotations.service';

export interface ImportResult {
  quotationId: string;
  projectId: string;
  reference: string;
  name: string;
  customer: string;
  lines: number;
  linkedToCatalog: number;
  totalEstimatedCost: number;
}

/** Turns an uploaded Somec "Analisi" workbook into a project + draft quotation. */
@Injectable()
export class ImportsService {
  private readonly log = new Logger(ImportsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly quotations: QuotationsService,
    private readonly catalog: CatalogService,
  ) {}

  async importWorkbook(file: { originalname: string; buffer: Buffer }, user: AuthUser): Promise<ImportResult> {
    if (!/\.xlsx$/i.test(file.originalname)) throw new BadRequestException('Upload an Excel Analisi workbook (.xlsx).');
    // Keep the original name: the extractor derives the workbook id from it, which lets known workbooks link to the catalog.
    const dir = await mkdtemp(path.join(tmpdir(), 'somec-import-'));
    const filePath = path.join(dir, path.basename(file.originalname).replace(/[^\w .()-]/g, '_'));
    try {
      await writeFile(filePath, file.buffer);
      let extraction: Awaited<ReturnType<typeof extractWorkbook>>;
      try {
        extraction = await extractWorkbook(filePath);
      } catch (e) {
        throw new BadRequestException(`This file is not a Somec Analisi workbook (${e instanceof Error ? e.message : 'unreadable'}). It needs DATI GEN. and ELENCO COSTI sheets.`);
      }
      const { summary, records } = extraction;
      const rows = records.filter((r) => r.description || r.title);
      if (!rows.length) throw new BadRequestException('No priced lines were found in ELENCO COSTI.');

      const customerName = (summary.client ?? 'Imported customer').trim();
      const projectName = (summary.projectName ?? summary.offerNo ?? path.parse(file.originalname).name).trim();
      const customer = await this.prisma.customer.upsert({ where: { ownerId_name: { ownerId: user.id, name: customerName } }, update: {}, create: { ownerId: user.id, name: customerName } });
      const project =
        (await this.prisma.project.findFirst({ where: { ownerId: user.id, customerId: customer.id, name: projectName } })) ??
        (await this.prisma.project.create({ data: { ownerId: user.id, customerId: customer.id, name: projectName, brief: `Imported from ${file.originalname}` } }));

      const template = this.catalog.workbooks.some((w) => w.workbook === summary.workbook) ? summary.workbook : (this.catalog.workbooks[0]?.workbook ?? summary.workbook);
      const quotation = await this.quotations.create(
        { name: projectName, projectId: project.id, reference: summary.offerNo ?? path.parse(file.originalname).name.split(' ')[0], date: summary.projectDate ?? new Date().toISOString().slice(0, 10), estimator: summary.estimator ?? user.name, templateWorkbook: template, status: 'draft' },
        user.id,
      );

      let linked = 0;
      let total = 0;
      for (const r of rows) {
        const quantity = r.quantity && r.quantity > 0 ? r.quantity : 1;
        if (this.catalog.has(r.id)) {
          await this.quotations.addItem(quotation.id, { catalogId: r.id, quantity }, user.id);
          linked++;
        } else {
          const q = await this.quotations.addRow(quotation.id, { position: r.position ?? undefined, itemCode: r.itemCode ?? undefined, description: r.description ?? r.title ?? 'Imported line', unit: r.unit ?? 'Pcs', quantity, L: r.L, H: r.H, lotto: r.lotto }, user.id);
          const added = q.items[q.items.length - 1];
          if (added && r.unitCost && r.unitCost > 0) await this.quotations.updateItem(quotation.id, added.id, { unitCostOverride: r.unitCost }, user.id);
        }
        total += (r.unitCost ?? 0) * quantity;
      }
      this.log.log(`Imported ${file.originalname}: ${rows.length} lines (${linked} linked to the catalog) into ${quotation.reference}`);
      return { quotationId: quotation.id, projectId: project.id, reference: quotation.reference, name: projectName, customer: customerName, lines: rows.length, linkedToCatalog: linked, totalEstimatedCost: Math.round(total * 100) / 100 };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
