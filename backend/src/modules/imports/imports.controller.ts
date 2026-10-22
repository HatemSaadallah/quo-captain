import { BadRequestException, Body, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthUser } from '../../common/interfaces/auth.interface';
import { CurrentUser } from '../auth/auth.decorators';
import { ImportsService, type ImportHeader, type ImportHistoryEntry, type ImportPreview, type ImportResult } from './imports.service';

@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 80 * 1024 * 1024 } }))
  upload(@UploadedFile() file: { originalname: string; buffer: Buffer } | undefined, @CurrentUser() user: AuthUser): Promise<ImportResult> {
    if (!file) throw new BadRequestException('Choose a workbook to import.');
    return this.imports.importWorkbook(file, user);
  }

  @Get('history')
  history(@CurrentUser() user: AuthUser): ImportHistoryEntry[] {
    return this.imports.history(user);
  }

  @Post('preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 80 * 1024 * 1024 } }))
  preview(@UploadedFile() file: { originalname: string; buffer: Buffer } | undefined, @CurrentUser() user: AuthUser): Promise<ImportPreview> {
    if (!file) throw new BadRequestException('Choose a workbook to import.');
    return this.imports.preview(file, user);
  }

  @Post(':token/commit')
  commit(@Param('token') token: string, @Body() body: ImportHeader, @CurrentUser() user: AuthUser): Promise<ImportResult> {
    return this.imports.commit(token, body ?? {}, user);
  }

  @Post(':token/reject')
  reject(@Param('token') token: string, @CurrentUser() user: AuthUser): { ok: true } {
    return this.imports.reject(token, user);
  }
}
