import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { QuotationsModule } from '../quotations/quotations.module';
import { GenerationModule } from '../generation/generation.module';
import { AssistantController } from './assistant.controller';
import { InsightsShareController } from './insights-share.controller';
import { AssistantService } from './assistant.service';

@Module({ imports: [CatalogModule, QuotationsModule, GenerationModule], controllers: [AssistantController, InsightsShareController], providers: [AssistantService] })
export class AssistantModule {}
