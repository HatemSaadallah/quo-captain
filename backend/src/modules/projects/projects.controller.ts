import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthUser } from '../../common/interfaces/auth.interface';
import type { SearchHit } from '../../common/interfaces/catalog.interface';
import type { AddItemDto, AddRowDto, AttachTabDto, CreateProjectDto, ElencoCosti, Project, ProjectValidation, UpdateItemDto, UpdateProjectDto } from '../../common/interfaces/project.interface';
import type { Benchmark, WorkbookView } from '../../common/interfaces/workbook-view.interface';
import { CurrentUser } from '../auth/auth.decorators';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<Project[]> {
    return this.projects.list(user.id);
  }

  @Post()
  create(@Body() body: CreateProjectDto, @CurrentUser() user: AuthUser): Promise<Project> {
    return this.projects.create(body, user.id);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<Project> {
    return this.projects.get(id, user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateProjectDto, @CurrentUser() user: AuthUser): Promise<Project> {
    return this.projects.update(id, body, user.id);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<{ ok: true }> {
    await this.projects.delete(id, user.id);
    return { ok: true };
  }

  @Get(':id/validation')
  validation(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<ProjectValidation> {
    return this.projects.validate(id, user.id);
  }

  /** The web ELENCO COSTI computed with the sheet's formulas. */
  @Get(':id/elenco-costi')
  elencoCosti(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<ElencoCosti> {
    return this.projects.elencoCosti(id, user.id);
  }

  /** PDF export of the web ELENCO COSTI. */
  @Get(':id/elenco-costi.pdf')
  async elencoCostiPdf(@Param('id') id: string, @CurrentUser() user: AuthUser, @Res() res: Response): Promise<void> {
    const { file, buffer } = await this.projects.elencoCostiPdf(id, user.id);
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `attachment; filename="${file.replace(/"/g, '')}"`);
    res.end(buffer);
  }

  /** The generated quotation as a clickable web workbook (ELENCO COSTI + evaluated analysis sheets). */
  @Get(':id/workbook')
  workbook(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<WorkbookView> {
    return this.projects.workbookView(id, user.id);
  }

  /** Historical benchmarking for a row: comparable analyses with specs, dates, quantities, sources and category costs. */
  @Get(':id/items/:itemId/benchmark')
  benchmark(@Param('id') id: string, @Param('itemId') itemId: string, @CurrentUser() user: AuthUser, @Query('limit') limit?: string): Promise<Benchmark> {
    return this.projects.benchmark(id, itemId, user.id, limit ? Number(limit) : undefined);
  }

  @Post(':id/items')
  addItem(@Param('id') id: string, @Body() body: AddItemDto, @CurrentUser() user: AuthUser): Promise<Project> {
    return this.projects.addItem(id, body, user.id);
  }

  /** Free row typed from the BOQ (no reference tab yet). */
  @Post(':id/rows')
  addRow(@Param('id') id: string, @Body() body: AddRowDto, @CurrentUser() user: AuthUser): Promise<Project> {
    return this.projects.addRow(id, body, user.id);
  }

  @Get(':id/items/:itemId/suggestions')
  suggestions(@Param('id') id: string, @Param('itemId') itemId: string, @CurrentUser() user: AuthUser, @Query('limit') limit?: string): Promise<SearchHit[]> {
    return this.projects.suggestions(id, itemId, user.id, limit ? Number(limit) : undefined);
  }

  @Post(':id/items/:itemId/attach')
  attach(@Param('id') id: string, @Param('itemId') itemId: string, @Body() body: AttachTabDto, @CurrentUser() user: AuthUser): Promise<Project> {
    return this.projects.attach(id, itemId, body, user.id);
  }

  @Delete(':id/items/:itemId/attach')
  detach(@Param('id') id: string, @Param('itemId') itemId: string, @CurrentUser() user: AuthUser): Promise<Project> {
    return this.projects.detach(id, itemId, user.id);
  }

  @Patch(':id/items/:itemId')
  updateItem(@Param('id') id: string, @Param('itemId') itemId: string, @Body() body: UpdateItemDto, @CurrentUser() user: AuthUser): Promise<Project> {
    return this.projects.updateItem(id, itemId, body, user.id);
  }

  @Delete(':id/items/:itemId')
  removeItem(@Param('id') id: string, @Param('itemId') itemId: string, @CurrentUser() user: AuthUser): Promise<Project> {
    return this.projects.removeItem(id, itemId, user.id);
  }
}
