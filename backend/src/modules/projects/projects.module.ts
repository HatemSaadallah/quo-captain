import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { CostingModule } from '../costing/costing.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [CatalogModule, CostingModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
