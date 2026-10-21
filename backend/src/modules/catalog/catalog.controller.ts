import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type { AuthUser } from '../../common/interfaces/auth.interface';
import { CurrentUser } from '../auth/auth.decorators';
import type { CatalogFacets, CatalogRecord, CreateCatalogProductDto, SearchHit, SearchResult } from '../../common/interfaces/catalog.interface';
import { CatalogService } from './catalog.service';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Post()
  create(@Body() body: CreateCatalogProductDto, @CurrentUser() user: AuthUser): Promise<CatalogRecord> {
    return this.catalog.createProduct(body, user.id);
  }

  @Get('facets')
  facets(): CatalogFacets {
    return this.catalog.facets();
  }

  @Get('custom')
  custom(): CatalogRecord[] {
    return this.catalog.records.filter((record) => record.custom);
  }

  @Get('search')
  search(
    @Query('q') q?: string,
    @Query('workbook') workbook?: string,
    @Query('category') category?: string,
    @Query('limit') limit?: string,
    @Query('mode') mode?: string,
  ): Promise<SearchResult> {
    return this.catalog.search({ q, workbook, category, limit: limit ? Number(limit) : undefined, noSemantic: mode === 'lexical' });
  }

  @Get(':id/similar')
  similar(@Param('id') id: string, @Query('limit') limit?: string): Promise<SearchHit[]> {
    return this.catalog.similar(id, limit ? Number(limit) : undefined);
  }

  @Get(':id')
  get(@Param('id') id: string): CatalogRecord {
    return this.catalog.get(id);
  }
}
