import { Body, Controller, Post } from '@nestjs/common';
import type { AuthUser } from '../../common/interfaces/auth.interface';
import { CurrentUser } from '../auth/auth.decorators';
import { AssistantService, type AssistantMessage , type AssistantReply } from './assistant.service';

@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Post('chat')
  chat(@Body() body: { messages?: AssistantMessage[]; contacts?: Array<Record<string, unknown>> }, @CurrentUser() user: AuthUser): Promise<AssistantReply> {
    return this.assistant.chat(body.messages ?? [], user, body.contacts ?? []);
  }
}
