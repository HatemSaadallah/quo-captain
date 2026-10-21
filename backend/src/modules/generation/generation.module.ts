import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { ProjectsModule } from '../projects/projects.module';
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';

@Module({
  imports: [CatalogModule, ProjectsModule],
  controllers: [GenerationController],
  providers: [GenerationService],
})
export class GenerationModule {}
