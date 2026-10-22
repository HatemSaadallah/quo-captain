import { BadRequestException, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthUser } from '../../common/interfaces/auth.interface';
import { CurrentUser } from '../auth/auth.decorators';
import { ImportsService, type ImportResult } from './imports.service';

@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 80 * 1024 * 1024 } }))
  upload(@UploadedFile() file: { originalname: string; buffer: Buffer } | undefined, @CurrentUser() user: AuthUser): Promise<ImportResult> {
    if (!file) throw new BadRequestException('Choose a workbook to import.');
    return this.imports.importWorkbook(file, user);
  }
}
