import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ExcelStatus, GenerationResult, ValidationReport } from '../../common/interfaces/generation.interface';
import { INPUT_DIR, OUTPUT_DIR } from '../../common/utils/paths';
import { detectExcel, recalculateWithExcel } from '../../excel/excel-automation';
import { generateWorkbook, safeFileStem } from '../../excel/generator';
import { validateGenerated } from '../../excel/validator';
import { CatalogService } from '../catalog/catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { QuotationsService } from '../quotations/quotations.service';

export interface OutputEntry {
  folder: string;
  file: string;
  size: number;
  modifiedAt: string;
}

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9 _.()-]{0,120}$/;

@Injectable()
export class GenerationService {
  private readonly log = new Logger(GenerationService.name);

  constructor(
    private readonly quotations: QuotationsService,
    private readonly catalog: CatalogService,
    private readonly prisma: PrismaService,
  ) {}

  excelStatus(force = false): Promise<ExcelStatus> {
    return detectExcel(force);
  }

  async generate(quotationId: string, userId: string): Promise<GenerationResult> {
    const quotation = await this.quotations.get(quotationId, userId);
    const validation = this.quotations.validateQuotation(quotation);
    if (!validation.ok) throw new BadRequestException({ message: 'Quotation is not ready for generation', issues: validation.issues });
    const templatePath = path.join(INPUT_DIR, quotation.templateWorkbook);
    if (!existsSync(templatePath) || !this.catalog.workbooks.some((w) => w.workbook === quotation.templateWorkbook)) {
      throw new BadRequestException(`Template workbook ${quotation.templateWorkbook} not found in data/input`);
    }
    const outputDir = this.allocateOutputDir(quotation.reference);
    const t0 = Date.now();
    const outcome = await generateWorkbook({
      quotation,
      templatePath,
      outputDir,
      sourcePathOf: (wb) => {
        const p = path.join(INPUT_DIR, wb);
        if (!this.catalog.workbooks.some((w) => w.workbook === wb) || !existsSync(p)) throw new Error(`Source workbook ${wb} not found in data/input`);
        return p;
      },
    });
    this.log.log(`Generated ${outcome.outputFile} in ${((Date.now() - t0) / 1000).toFixed(1)}s (${outcome.changes.length} changes)`);

    const excel = await detectExcel();
    let recalc = { performed: false, method: 'none', detail: excel.detail };
    let engine: ValidationReport['engine'] = 'ooxml';
    if (excel.available) {
      const r = await recalculateWithExcel(outcome.outputFile);
      recalc = r.ok ? { performed: true, method: 'Microsoft Excel (AppleScript full recalculation)', detail: r.detail } : { performed: false, method: 'none', detail: `Excel recalculation failed: ${r.detail}` };
      if (r.ok) engine = 'ooxml+excel';
      else this.log.warn(recalc.detail);
    }
    const report = await validateGenerated(quotation, outcome, recalc, engine);
    report.sourceHashes = outcome.sourceHashes;
    const reportFile = path.join(outputDir, 'validation_report.json');
    writeFileSync(reportFile, JSON.stringify({ ...report, changes: outcome.changes }, null, 2));
    await this.quotations.recordGeneration(quotationId, { file: path.relative(OUTPUT_DIR, outcome.outputFile), reportFile: path.relative(OUTPUT_DIR, reportFile), status: report.status, engine });
    return { outputFile: path.relative(OUTPUT_DIR, outcome.outputFile), reportFile: path.relative(OUTPUT_DIR, reportFile), report };
  }

  /** A directory that did not exist before this call (exclusive create), so concurrent generations never share files. */
  private allocateOutputDir(reference: string): string {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
    for (let attempt = 0; attempt < 20; attempt++) {
      const dir = path.join(OUTPUT_DIR, `${safeFileStem(reference)}_${stamp}_${randomBytes(3).toString('hex')}`);
      try {
        mkdirSync(dir); // throws EEXIST if taken
        return dir;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      }
    }
    throw new Error('Could not allocate a unique output directory');
  }

  /** Output files of the user's own generations (Generation -> Quotation.ownerId). */
  async listOutputs(userId: string): Promise<OutputEntry[]> {
    const gens = await this.prisma.generation.findMany({ where: { quotation: { ownerId: userId } }, orderBy: { createdAt: 'desc' } });
    const out: OutputEntry[] = [];
    for (const g of gens) {
      for (const rel of [g.file, g.reportFile]) {
        const abs = path.join(OUTPUT_DIR, rel);
        if (!existsSync(abs)) continue;
        const st = statSync(abs);
        out.push({ folder: rel.split('/')[0], file: rel.split('/').slice(1).join('/'), size: st.size, modifiedAt: st.mtime.toISOString() });
      }
    }
    return out;
  }

  /** Absolute path of an output file: the folder must belong to a generation of one of the user's quotations. */
  async resolveOutput(folder: string, file: string, userId: string): Promise<string> {
    if (!SAFE_NAME.test(folder) || !SAFE_NAME.test(file)) throw new BadRequestException('Invalid output name');
    const owned = await this.prisma.generation.findFirst({ where: { quotation: { ownerId: userId }, OR: [{ file: { startsWith: `${folder}/` } }, { reportFile: { startsWith: `${folder}/` } }] }, select: { id: true } });
    if (!owned) throw new NotFoundException('Output not found');
    const p = path.resolve(OUTPUT_DIR, folder, file);
    if (!p.startsWith(path.resolve(OUTPUT_DIR, folder) + path.sep) || !existsSync(p)) throw new NotFoundException('Output not found');
    return p;
  }

  async readReport(folder: string, userId: string): Promise<ValidationReport> {
    return JSON.parse(readFileSync(await this.resolveOutput(folder, 'validation_report.json', userId), 'utf8')) as ValidationReport;
  }
}
