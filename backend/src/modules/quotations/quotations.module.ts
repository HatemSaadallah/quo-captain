import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { CostingModule } from '../costing/costing.module';
import { QuotationsController } from './quotations.controller';
import { QuotationsService } from './quotations.service';

@Module({
  imports: [CatalogModule, CostingModule],
  controllers: [QuotationsController],
  providers: [QuotationsService],
  exports: [QuotationsService],
})
export class QuotationsModule {}
