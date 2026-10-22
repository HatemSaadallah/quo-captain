import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { CostingModule } from '../costing/costing.module';
import { ProductPreviewController } from './product-preview.controller';
import { QuotationsController } from './quotations.controller';
import { QuotationsService } from './quotations.service';

@Module({
  imports: [CatalogModule, CostingModule],
  controllers: [QuotationsController, ProductPreviewController],
  providers: [QuotationsService],
  exports: [QuotationsService],
})
export class QuotationsModule {}
