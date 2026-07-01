import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { Capability } from '../authorization/capability';
import { RequiresCapability } from '../authorization/capability.guard';
import { ArchiveProjectDto, CreateProjectDto, UpdateProjectDto } from './dto';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@Controller('organizations/:organizationId/projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.projects.list(organizationId, user.id);
  }

  @Get(':projectId')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.projects.get(organizationId, user.id, projectId);
  }

  @Post()
  @RequiresCapability(Capability.ProjectsManage)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: CreateProjectDto,
  ) {
    return this.projects.create(organizationId, user.id, body);
  }

  @Patch(':projectId')
  @RequiresCapability(Capability.ProjectsManage)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() body: UpdateProjectDto,
  ) {
    return this.projects.update(organizationId, user.id, projectId, body);
  }

  @Post(':projectId/archive')
  @RequiresCapability(Capability.ProjectsManage)
  archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() body: ArchiveProjectDto,
  ) {
    return this.projects.archive(
      organizationId,
      user.id,
      projectId,
      body.version,
    );
  }
}
