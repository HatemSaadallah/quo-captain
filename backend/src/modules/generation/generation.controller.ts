import { Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthUser } from '../../common/interfaces/auth.interface';
import type { ExcelStatus, GenerationResult, ValidationReport } from '../../common/interfaces/generation.interface';
import { CurrentUser } from '../auth/auth.decorators';
import { GenerationService, type OutputEntry } from './generation.service';

@Controller()
export class GenerationController {
  constructor(private readonly generation: GenerationService) {}

  @Post('projects/:id/generate')
  generate(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<GenerationResult> {
    return this.generation.generate(id, user.id);
  }

  @Get('generation/excel-status')
  excelStatus(@Query('refresh') refresh?: string): Promise<ExcelStatus> {
    return this.generation.excelStatus(refresh === '1');
  }

  @Get('outputs')
  outputs(): OutputEntry[] {
    return this.generation.listOutputs();
  }

  @Get('outputs/:folder/report')
  report(@Param('folder') folder: string): ValidationReport {
    return this.generation.readReport(folder);
  }

  @Get('outputs/:folder/:file')
  download(@Param('folder') folder: string, @Param('file') file: string, @Res() res: Response): void {
    res.download(this.generation.resolveOutput(folder, file), file);
  }
}
