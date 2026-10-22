import { Module } from '@nestjs/common';
import { QuotationsModule } from '../quotations/quotations.module';
import { EmailsController } from './emails.controller';
import { EmailsService } from './emails.service';

@Module({ imports: [QuotationsModule], controllers: [EmailsController], providers: [EmailsService] })
export class EmailsModule {}
