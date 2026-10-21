import { Body, Controller, Get, Post } from '@nestjs/common';
import type { AuthUser } from '../../common/interfaces/auth.interface';
import type { CreateProjectDto, Project } from '../../common/interfaces/project.interface';
import { CurrentUser } from '../auth/auth.decorators';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<Project[]> { return this.projects.list(user.id); }

  @Get('contacts')
  contacts() { return this.projects.listContacts(); }

  @Post()
  create(@Body() body: CreateProjectDto, @CurrentUser() user: AuthUser): Promise<Project> { return this.projects.create(body, user.id); }
}
