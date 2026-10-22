import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { QuotationsModule } from '../quotations/quotations.module';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

@Module({ imports: [CatalogModule, QuotationsModule], controllers: [ImportsController], providers: [ImportsService] })
export class ImportsModule {}
