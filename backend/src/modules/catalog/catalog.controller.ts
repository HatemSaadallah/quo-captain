import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../../common/utils/paths';
import type { AuthUser } from '../../common/interfaces/auth.interface';
import { CurrentUser, Public } from '../auth/auth.decorators';
import type { CatalogFacets, CatalogRecord, CreateCatalogProductDto, SearchHit, SearchResult } from '../../common/interfaces/catalog.interface';
import { CatalogService } from './catalog.service';

/** Product images: an uploaded file, or a chosen photo from the built-in library (a "preset"). */
const IMAGES_DIR = path.join(DATA_DIR, 'product-images');
const PRESETS = path.join(IMAGES_DIR, 'presets.json');
const fileKey = (id: string): string => createHash('sha1').update(id).digest('hex');
const readPresets = (): Record<string, string> => (existsSync(PRESETS) ? (JSON.parse(readFileSync(PRESETS, 'utf8')) as Record<string, string>) : {});

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  /** Product id -> image url for every product with its own picture. */
  @Get('images')
  images(): Record<string, string> {
    const out: Record<string, string> = { ...readPresets() };
    if (!existsSync(IMAGES_DIR)) return out;
    const files = new Map(readdirSync(IMAGES_DIR).filter((f) => /^[0-9a-f]{40}\./.test(f)).map((f) => [f.slice(0, 40), f]));
    for (const r of this.catalog.records) {
      const f = files.get(fileKey(r.id));
      if (f) out[r.id] = `/api/catalog/${encodeURIComponent(r.id)}/image?v=${Math.round(statSync(path.join(IMAGES_DIR, f)).mtimeMs)}`;
    }
    return out;
  }

  @Post(':id/image')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  setImage(@Param('id') id: string, @UploadedFile() file: { originalname: string; buffer: Buffer; mimetype: string } | undefined, @Body() body: { preset?: string }): { ok: true } {
    this.catalog.get(id); // 404 for unknown products
    mkdirSync(IMAGES_DIR, { recursive: true });
    if (file) {
      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.mimetype];
      if (!ext) throw new BadRequestException('Upload a JPG, PNG or WebP image.');
      for (const old of readdirSync(IMAGES_DIR).filter((f) => f.startsWith(fileKey(id)))) unlinkSync(path.join(IMAGES_DIR, old)); // replaced
      writeFileSync(path.join(IMAGES_DIR, `${fileKey(id)}.${ext}`), file.buffer);
      const presets = readPresets();
      delete presets[id];
      writeFileSync(PRESETS, JSON.stringify(presets));
      return { ok: true };
    }
    if (!body?.preset || !/^\/products\/[a-z]+-\d+\.jpg$/.test(body.preset)) throw new BadRequestException('Choose an image file or a suggested photo.');
    writeFileSync(PRESETS, JSON.stringify({ ...readPresets(), [id]: body.preset }));
    return { ok: true };
  }

  @Public()
  @Get(':id/image')
  image(@Param('id') id: string, @Res() res: Response): void {
    const f = existsSync(IMAGES_DIR) ? readdirSync(IMAGES_DIR).find((x) => x.startsWith(fileKey(id))) : undefined;
    if (!f) throw new NotFoundException('No image for this product');
    res.setHeader('cache-control', 'private, max-age=3600');
    res.sendFile(path.join(IMAGES_DIR, f));
  }

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
