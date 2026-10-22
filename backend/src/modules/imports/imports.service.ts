import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DATA_DIR } from '../../common/utils/paths';
import path from 'node:path';
import { extractWorkbook } from '../../excel/catalog-extractor';
import type { AuthUser } from '../../common/interfaces/auth.interface';
import { CatalogService } from '../catalog/catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { QuotationsService } from '../quotations/quotations.service';

export type LineStatus = 'ready' | 'match' | 'review';
export interface ImportPreviewLine { row: number; position: string | null; itemCode: string | null; title: string; unit: string | null; quantity: number; unitCost: number | null; status: LineStatus; reason: string }
export interface ImportPreview {
  token: string;
  fileName: string;
  header: { reference: string; name: string; customer: string; date: string; estimator: string };
  counts: Record<LineStatus, number>;
  totalEstimatedCost: number;
  lines: ImportPreviewLine[];
}
export interface ImportHeader { reference?: string; name?: string; customer?: string; date?: string; estimator?: string }

export interface ImportHistoryEntry {
  id: string;
  at: string;
  userId: string;
  fileName: string;
  status: 'imported' | 'rejected';
  reference: string;
  customer: string;
  name: string;
  lines: number;
  linkedToCatalog: number | null;
  totalEstimatedCost: number | null;
  quotationId: string | null;
}

/** MVP history: a JSON file under data/imports (one list for all users, filtered on read). */
const HISTORY = path.join(DATA_DIR, 'imports', 'history.json');
const readHistory = (): ImportHistoryEntry[] => (existsSync(HISTORY) ? (JSON.parse(readFileSync(HISTORY, 'utf8')) as ImportHistoryEntry[]) : []);
const addHistory = (e: ImportHistoryEntry): void => {
  mkdirSync(path.dirname(HISTORY), { recursive: true });
  writeFileSync(HISTORY, JSON.stringify([e, ...readHistory()].slice(0, 500), null, 1));
};

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
  /** Uploaded files waiting for review (MVP: in memory, 30 minutes). */
  private readonly pending = new Map<string, { at: number; file: { originalname: string; buffer: Buffer }; userId: string; header?: ImportPreview['header']; lines?: number }>();
  constructor(
    private readonly prisma: PrismaService,
    private readonly quotations: QuotationsService,
    private readonly catalog: CatalogService,
  ) {}

  /** Stage 1 (like Virtuous): read the file, sort every line into ready / match needed / needs review. Nothing is saved. */
  async preview(file: { originalname: string; buffer: Buffer }, user: AuthUser): Promise<ImportPreview> {
    if (!/\.xlsx$/i.test(file.originalname)) throw new BadRequestException('Upload an Excel Analisi workbook (.xlsx).');
    const { summary, records } = await this.extract(file);
    for (const [k, v] of this.pending) if (Date.now() - v.at > 30 * 60_000) this.pending.delete(k);
    const token = randomUUID();
    this.pending.set(token, { at: Date.now(), file, userId: user.id });
    const lines: ImportPreviewLine[] = records.filter((r) => r.description || r.title).map((r) => {
      const title = (r.title ?? r.description ?? '').split(/\r?\n/)[0];
      const quantity = r.quantity ?? 0;
      let status: LineStatus = 'ready';
      let reason = 'Linked to its historical analysis';
      if (!this.catalog.has(r.id)) {
        status = 'match';
        reason = r.unitCost ? 'No analysis in the catalog yet: imported as a priced line' : 'No analysis and no price: attach one after import';
      }
      if (!(quantity > 0)) [status, reason] = ['review', 'Quantity is zero or missing: imported as 1'];
      else if (/deduct|extra|option|addition/i.test(title)) [status, reason] = ['review', 'Extra, option or deduction: check it belongs in the offer'];
      else if (!r.unitCost) [status, reason] = ['review', 'No unit cost in the workbook'];
      return { row: r.row, position: r.position, itemCode: r.itemCode, title, unit: r.unit, quantity, unitCost: r.unitCost, status, reason };
    });
    const counts = { ready: 0, match: 0, review: 0 } as Record<LineStatus, number>;
    for (const l of lines) counts[l.status]++;
    const pend = this.pending.get(token);
    if (pend) pend.lines = lines.length;
    return {
      token,
      fileName: file.originalname,
      header: {
        reference: summary.offerNo ?? path.parse(file.originalname).name.split(' ')[0],
        name: summary.projectName ?? path.parse(file.originalname).name,
        customer: summary.client ?? '',
        date: summary.projectDate ?? new Date().toISOString().slice(0, 10),
        estimator: summary.estimator ?? user.name,
      },
      counts,
      totalEstimatedCost: Math.round(lines.reduce((acc, l) => acc + (l.unitCost ?? 0) * (l.quantity || 1), 0) * 100) / 100,
      lines,
    };
  }

  /** Stage 2: accept the reviewed file, with any header corrections. */
  async commit(token: string, header: ImportHeader, user: AuthUser): Promise<ImportResult> {
    const p = this.pending.get(token);
    if (!p || p.userId !== user.id) throw new BadRequestException('This import expired. Upload the file again.');
    this.pending.delete(token);
    return this.importWorkbook(p.file, user, header);
  }

  /** Discard a reviewed file without importing. */
  reject(token: string, user: AuthUser): { ok: true } {
    const p = this.pending.get(token);
    if (p && p.userId === user.id) {
      this.pending.delete(token);
      addHistory({ id: randomUUID(), at: new Date().toISOString(), userId: user.id, fileName: p.file.originalname, status: 'rejected', reference: path.parse(p.file.originalname).name.split(' ')[0], customer: '', name: '', lines: p.lines ?? 0, linkedToCatalog: null, totalEstimatedCost: null, quotationId: null });
    }
    return { ok: true };
  }

  history(user: AuthUser): ImportHistoryEntry[] {
    return readHistory().filter((e) => e.userId === user.id).slice(0, 50);
  }

  private async extract(file: { originalname: string; buffer: Buffer }): Promise<Awaited<ReturnType<typeof extractWorkbook>>> {
    const dir = await mkdtemp(path.join(tmpdir(), 'somec-import-'));
    const filePath = path.join(dir, path.basename(file.originalname).replace(/[^\w .()-]/g, '_'));
    try {
      await writeFile(filePath, file.buffer);
      return await extractWorkbook(filePath);
    } catch (e) {
      throw new BadRequestException(`This file is not a Somec Analisi workbook (${e instanceof Error ? e.message : 'unreadable'}). It needs DATI GEN. and ELENCO COSTI sheets.`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async importWorkbook(file: { originalname: string; buffer: Buffer }, user: AuthUser, header: ImportHeader = {}): Promise<ImportResult> {
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

      const customerName = (header.customer?.trim() || summary.client || 'Imported customer').trim();
      const projectName = (header.name?.trim() || summary.projectName || summary.offerNo || path.parse(file.originalname).name).trim();
      const customer = await this.prisma.customer.upsert({ where: { ownerId_name: { ownerId: user.id, name: customerName } }, update: {}, create: { ownerId: user.id, name: customerName } });
      const project =
        (await this.prisma.project.findFirst({ where: { ownerId: user.id, customerId: customer.id, name: projectName } })) ??
        (await this.prisma.project.create({ data: { ownerId: user.id, customerId: customer.id, name: projectName, brief: `Imported from ${file.originalname}` } }));

      const template = this.catalog.workbooks.some((w) => w.workbook === summary.workbook) ? summary.workbook : (this.catalog.workbooks[0]?.workbook ?? summary.workbook);
      const quotation = await this.quotations.create(
        { name: projectName, projectId: project.id, reference: header.reference?.trim() || summary.offerNo || path.parse(file.originalname).name.split(' ')[0], date: header.date?.trim() || summary.projectDate || new Date().toISOString().slice(0, 10), estimator: header.estimator?.trim() || summary.estimator || user.name, templateWorkbook: template, status: 'draft' },
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
      void this.quotations.get(quotation.id, user.id).then((q) => this.quotations.warm(q.items)); // costs ready by the time the draft opens
      addHistory({ id: randomUUID(), at: new Date().toISOString(), userId: user.id, fileName: file.originalname, status: 'imported', reference: quotation.reference, customer: customerName, name: projectName, lines: rows.length, linkedToCatalog: linked, totalEstimatedCost: Math.round(total * 100) / 100, quotationId: quotation.id });
      return { quotationId: quotation.id, projectId: project.id, reference: quotation.reference, name: projectName, customer: customerName, lines: rows.length, linkedToCatalog: linked, totalEstimatedCost: Math.round(total * 100) / 100 };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
