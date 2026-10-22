import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { CustomersController, ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectIntelligenceService } from './project-intelligence.service';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({ imports: [CatalogModule], controllers: [ProjectsController, CustomersController, DashboardController], providers: [ProjectsService, ProjectIntelligenceService, DashboardService], exports: [ProjectsService] })
export class ProjectsModule {}
