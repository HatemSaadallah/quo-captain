import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { GenerationModule } from './modules/generation/generation.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { QuotationsModule } from './modules/quotations/quotations.module';
import { UsersModule } from './modules/users/users.module';
import { AssistantModule } from './modules/assistant/assistant.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { MaterialsModule } from './modules/materials/materials.module';
import { ImportsModule } from './modules/imports/imports.module';
import { EmailsModule } from './modules/emails/emails.module';

@Module({
  imports: [PrismaModule, AuthModule, UsersModule, CatalogModule, QuotationsModule, GenerationModule, AssistantModule, ProjectsModule, MaterialsModule, ImportsModule, EmailsModule],
})
export class AppModule {}
