import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import type { AuthUser } from '../../common/interfaces/auth.interface';
import type { CreateProjectDto, Project } from '../../common/interfaces/project.interface';
import { CurrentUser } from '../auth/auth.decorators';
import { ProjectsService } from './projects.service';
import { ProjectIntelligenceService } from './project-intelligence.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService, private readonly intelligence: ProjectIntelligenceService) {}

  @Post('search')
  search(@Body() body: { query?: string }, @CurrentUser() user: AuthUser) { return this.intelligence.search(body.query, user.id); }

  @Post(':id/requirements')
  requirements(@Param('id') id: string, @Body() body: { text?: string; fileName?: string }, @CurrentUser() user: AuthUser) { return this.intelligence.requirements(id, body ?? {}, user.id); }

  @Get(':id/messages')
  transcript(@Param('id') id: string, @CurrentUser() user: AuthUser) { return this.intelligence.transcript(id, user.id); }

  @Post(':id/messages')
  chat(@Param('id') id: string, @Body() body: { message?: string }, @CurrentUser() user: AuthUser) { return this.intelligence.chat(id, body.message, user); }

  @Post(':id/messages/:messageId/draft')
  draft(@Param('id') id: string, @Param('messageId') messageId: string, @Body() body: { name?: string; reference?: string }, @CurrentUser() user: AuthUser) { return this.intelligence.createDraft(id, messageId, body, user); }

  @Patch(':id/brief')
  brief(@Param('id') id: string, @Body() body: { brief?: string }, @CurrentUser() user: AuthUser) { return this.intelligence.updateBrief(id, body.brief, user.id); }

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<Project[]> { return this.projects.list(user.id); }

  @Get('contacts')
  contacts() { return this.projects.listContacts(); }

  @Post()
  create(@Body() body: CreateProjectDto, @CurrentUser() user: AuthUser): Promise<Project> { return this.projects.create(body, user.id); }

  @Patch(':id/contacts')
  updateContacts(@Param('id') id: string, @Body() body: { contactIds: string[] }, @CurrentUser() user: AuthUser): Promise<Project> {
    return this.projects.updateContacts(id, body.contactIds, user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: CreateProjectDto, @CurrentUser() user: AuthUser): Promise<Project> {
    return this.projects.update(id, body, user.id);
  }
}

@Controller('customers')
export class CustomersController {
  constructor(private readonly projects: ProjectsService, private readonly intelligence: ProjectIntelligenceService) {}

  @Post('search')
  search(@Body() body: { query?: string }, @CurrentUser() user: AuthUser) { return this.intelligence.searchCustomers(body.query, user.id); }

  @Get()
  list(@CurrentUser() user: AuthUser) { return this.projects.listCustomers(user.id); }
}
