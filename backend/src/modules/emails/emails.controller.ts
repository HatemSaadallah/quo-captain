import { Body, Controller, Post } from '@nestjs/common';
import type { AuthUser } from '../../common/interfaces/auth.interface';
import { CurrentUser } from '../auth/auth.decorators';
import { EmailsService, type SendEmailDto } from './emails.service';

@Controller('emails')
export class EmailsController {
  constructor(private readonly emails: EmailsService) {}

  @Post()
  send(@Body() body: SendEmailDto, @CurrentUser() user: AuthUser): Promise<{ id: string; to: string[] }> {
    return this.emails.send(body, user);
  }
}
