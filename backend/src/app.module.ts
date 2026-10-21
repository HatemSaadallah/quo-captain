import { Module } from '@nestjs/common';
import { CatalogModule } from './modules/catalog/catalog.module';
import { GenerationModule } from './modules/generation/generation.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { ProjectsModule } from './modules/projects/projects.module';

@Module({
  imports: [PrismaModule, CatalogModule, ProjectsModule, GenerationModule],
})
export class AppModule {}
