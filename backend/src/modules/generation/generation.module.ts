import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { QuotationsModule } from '../quotations/quotations.module';
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';

@Module({
  imports: [CatalogModule, QuotationsModule],
  controllers: [GenerationController],
  providers: [GenerationService],
  exports: [GenerationService],
})
export class GenerationModule {}
