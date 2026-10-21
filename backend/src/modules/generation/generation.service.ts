import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ExcelStatus, GenerationResult, ValidationReport } from '../../common/interfaces/generation.interface';
import { INPUT_DIR, OUTPUT_DIR } from '../../common/utils/paths';
import { detectExcel, recalculateWithExcel } from '../../excel/excel-automation';
import { generateWorkbook, safeFileStem } from '../../excel/generator';
import { validateGenerated } from '../../excel/validator';
import { CatalogService } from '../catalog/catalog.service';
import { ProjectsService } from '../projects/projects.service';

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
    private readonly projects: ProjectsService,
    private readonly catalog: CatalogService,
  ) {}

  excelStatus(force = false): Promise<ExcelStatus> {
    return detectExcel(force);
  }

  async generate(projectId: string, userId: string): Promise<GenerationResult> {
    const project = await this.projects.get(projectId, userId);
    const validation = this.projects.validateProject(project);
    if (!validation.ok) throw new BadRequestException({ message: 'Project is not ready for generation', issues: validation.issues });
    const templatePath = path.join(INPUT_DIR, project.templateWorkbook);
    if (!existsSync(templatePath) || !this.catalog.workbooks.some((w) => w.workbook === project.templateWorkbook)) {
      throw new BadRequestException(`Template workbook ${project.templateWorkbook} not found in data/input`);
    }
    const outputDir = this.allocateOutputDir(project.reference);
    const t0 = Date.now();
    const outcome = await generateWorkbook({
      project,
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
    const report = await validateGenerated(project, outcome, recalc, engine);
    report.sourceHashes = outcome.sourceHashes;
    const reportFile = path.join(outputDir, 'validation_report.json');
    writeFileSync(reportFile, JSON.stringify({ ...report, changes: outcome.changes }, null, 2));
    await this.projects.recordGeneration(projectId, { file: path.relative(OUTPUT_DIR, outcome.outputFile), reportFile: path.relative(OUTPUT_DIR, reportFile), status: report.status, engine });
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

  listOutputs(): OutputEntry[] {
    if (!existsSync(OUTPUT_DIR)) return [];
    const out: OutputEntry[] = [];
    for (const folder of readdirSync(OUTPUT_DIR)) {
      const dir = path.join(OUTPUT_DIR, folder);
      if (!statSync(dir).isDirectory()) continue;
      for (const file of readdirSync(dir)) {
        const st = statSync(path.join(dir, file));
        out.push({ folder, file, size: st.size, modifiedAt: st.mtime.toISOString() });
      }
    }
    return out.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  }

  /** Absolute path of an output file, refusing anything outside data/output. */
  resolveOutput(folder: string, file: string): string {
    if (!SAFE_NAME.test(folder) || !SAFE_NAME.test(file)) throw new BadRequestException('Invalid output name');
    const p = path.resolve(OUTPUT_DIR, folder, file);
    if (!p.startsWith(path.resolve(OUTPUT_DIR) + path.sep) || !existsSync(p)) throw new NotFoundException('Output not found');
    return p;
  }

  readReport(folder: string): ValidationReport {
    return JSON.parse(readFileSync(this.resolveOutput(folder, 'validation_report.json'), 'utf8')) as ValidationReport;
  }
}
