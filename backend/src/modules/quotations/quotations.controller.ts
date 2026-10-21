import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthUser } from '../../common/interfaces/auth.interface';
import type { SearchHit } from '../../common/interfaces/catalog.interface';
import type { AddItemDto, AddRowDto, AttachTabDto, CreateQuotationDto, ElencoCosti, Quotation, QuotationValidation, UpdateItemDto, UpdateQuotationDto } from '../../common/interfaces/quotation.interface';
import type { Benchmark, WorkbookView } from '../../common/interfaces/workbook-view.interface';
import { CurrentUser } from '../auth/auth.decorators';
import { QuotationsService } from './quotations.service';

@Controller('quotations')
export class QuotationsController {
  constructor(private readonly quotations: QuotationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<Quotation[]> {
    return this.quotations.list(user.id);
  }

  @Post()
  create(@Body() body: CreateQuotationDto, @CurrentUser() user: AuthUser): Promise<Quotation> {
    return this.quotations.create(body, user.id);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<Quotation> {
    return this.quotations.get(id, user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateQuotationDto, @CurrentUser() user: AuthUser): Promise<Quotation> {
    return this.quotations.update(id, body, user.id);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<{ ok: true }> {
    await this.quotations.delete(id, user.id);
    return { ok: true };
  }

  @Get(':id/validation')
  validation(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<QuotationValidation> {
    return this.quotations.validate(id, user.id);
  }

  /** The web ELENCO COSTI computed with the sheet's formulas. */
  @Get(':id/elenco-costi')
  elencoCosti(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<ElencoCosti> {
    return this.quotations.elencoCosti(id, user.id);
  }

  /** PDF export of the web ELENCO COSTI. */
  @Get(':id/elenco-costi.pdf')
  async elencoCostiPdf(@Param('id') id: string, @CurrentUser() user: AuthUser, @Res() res: Response): Promise<void> {
    const { file, buffer } = await this.quotations.elencoCostiPdf(id, user.id);
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `attachment; filename="${file.replace(/"/g, '')}"`);
    res.end(buffer);
  }

  /** The generated quotation as a clickable web workbook (ELENCO COSTI + evaluated analysis sheets). */
  @Get(':id/workbook')
  workbook(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<WorkbookView> {
    return this.quotations.workbookView(id, user.id);
  }

  /** Historical benchmarking for a row: comparable analyses with specs, dates, quantities, sources and category costs. */
  @Get(':id/items/:itemId/benchmark')
  benchmark(@Param('id') id: string, @Param('itemId') itemId: string, @CurrentUser() user: AuthUser, @Query('limit') limit?: string): Promise<Benchmark> {
    return this.quotations.benchmark(id, itemId, user.id, limit ? Number(limit) : undefined);
  }

  @Post(':id/items')
  addItem(@Param('id') id: string, @Body() body: AddItemDto, @CurrentUser() user: AuthUser): Promise<Quotation> {
    return this.quotations.addItem(id, body, user.id);
  }

  /** Free row typed from the BOQ (no reference tab yet). */
  @Post(':id/rows')
  addRow(@Param('id') id: string, @Body() body: AddRowDto, @CurrentUser() user: AuthUser): Promise<Quotation> {
    return this.quotations.addRow(id, body, user.id);
  }

  @Get(':id/items/:itemId/suggestions')
  suggestions(@Param('id') id: string, @Param('itemId') itemId: string, @CurrentUser() user: AuthUser, @Query('limit') limit?: string): Promise<SearchHit[]> {
    return this.quotations.suggestions(id, itemId, user.id, limit ? Number(limit) : undefined);
  }

  @Post(':id/items/:itemId/attach')
  attach(@Param('id') id: string, @Param('itemId') itemId: string, @Body() body: AttachTabDto, @CurrentUser() user: AuthUser): Promise<Quotation> {
    return this.quotations.attach(id, itemId, body, user.id);
  }

  @Delete(':id/items/:itemId/attach')
  detach(@Param('id') id: string, @Param('itemId') itemId: string, @CurrentUser() user: AuthUser): Promise<Quotation> {
    return this.quotations.detach(id, itemId, user.id);
  }

  @Patch(':id/items/:itemId')
  updateItem(@Param('id') id: string, @Param('itemId') itemId: string, @Body() body: UpdateItemDto, @CurrentUser() user: AuthUser): Promise<Quotation> {
    return this.quotations.updateItem(id, itemId, body, user.id);
  }

  @Delete(':id/items/:itemId')
  removeItem(@Param('id') id: string, @Param('itemId') itemId: string, @CurrentUser() user: AuthUser): Promise<Quotation> {
    return this.quotations.removeItem(id, itemId, user.id);
  }
}
