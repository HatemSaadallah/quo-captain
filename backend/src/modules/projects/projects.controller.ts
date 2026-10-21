import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import type { AuthUser } from '../../common/interfaces/auth.interface';
import type { AddItemDto, CreateProjectDto, Project, ProjectValidation, UpdateItemDto, UpdateProjectDto } from '../../common/interfaces/project.interface';
import { CurrentUser } from '../auth/auth.decorators';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<Project[]> {
    return this.projects.list(user.id);
  }

  @Post()
  create(@Body() body: CreateProjectDto, @CurrentUser() user: AuthUser): Promise<Project> {
    return this.projects.create(body, user.id);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<Project> {
    return this.projects.get(id, user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateProjectDto, @CurrentUser() user: AuthUser): Promise<Project> {
    return this.projects.update(id, body, user.id);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<{ ok: true }> {
    await this.projects.delete(id, user.id);
    return { ok: true };
  }

  @Get(':id/validation')
  validation(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<ProjectValidation> {
    return this.projects.validate(id, user.id);
  }

  @Post(':id/items')
  addItem(@Param('id') id: string, @Body() body: AddItemDto, @CurrentUser() user: AuthUser): Promise<Project> {
    return this.projects.addItem(id, body, user.id);
  }

  @Patch(':id/items/:itemId')
  updateItem(@Param('id') id: string, @Param('itemId') itemId: string, @Body() body: UpdateItemDto, @CurrentUser() user: AuthUser): Promise<Project> {
    return this.projects.updateItem(id, itemId, body, user.id);
  }

  @Delete(':id/items/:itemId')
  removeItem(@Param('id') id: string, @Param('itemId') itemId: string, @CurrentUser() user: AuthUser): Promise<Project> {
    return this.projects.removeItem(id, itemId, user.id);
  }
}
