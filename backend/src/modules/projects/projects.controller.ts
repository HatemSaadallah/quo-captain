import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import type { AddItemDto, CreateProjectDto, Project, ProjectValidation, UpdateItemDto, UpdateProjectDto } from '../../common/interfaces/project.interface';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(): Promise<Project[]> {
    return this.projects.list();
  }

  @Post()
  create(@Body() body: CreateProjectDto): Promise<Project> {
    return this.projects.create(body);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<Project> {
    return this.projects.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateProjectDto): Promise<Project> {
    return this.projects.update(id, body);
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<{ ok: true }> {
    await this.projects.delete(id);
    return { ok: true };
  }

  @Get(':id/validation')
  validation(@Param('id') id: string): Promise<ProjectValidation> {
    return this.projects.validate(id);
  }

  @Post(':id/items')
  addItem(@Param('id') id: string, @Body() body: AddItemDto): Promise<Project> {
    return this.projects.addItem(id, body);
  }

  @Patch(':id/items/:itemId')
  updateItem(@Param('id') id: string, @Param('itemId') itemId: string, @Body() body: UpdateItemDto): Promise<Project> {
    return this.projects.updateItem(id, itemId, body);
  }

  @Delete(':id/items/:itemId')
  removeItem(@Param('id') id: string, @Param('itemId') itemId: string): Promise<Project> {
    return this.projects.removeItem(id, itemId);
  }
}
