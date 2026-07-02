import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { Capability } from '../authorization/capability';
import { RequiresCapability } from '../authorization/capability.guard';
import { CreateLocationDto, CreateSiteDto, ViewportQueryDto } from './dto';
import { SitesService } from './sites.service';

@ApiTags('sites and locations')
@Controller('organizations/:organizationId/projects/:projectId')
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  @Get('sites')
  listSites(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.sites.listSites(organizationId, user.id, projectId);
  }

  @Post('sites')
  @RequiresCapability(Capability.ProjectsManage)
  createSite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() body: CreateSiteDto,
  ) {
    return this.sites.createSite(organizationId, user.id, projectId, body);
  }

  @Get('sites/:siteId/locations')
  listLocations(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('siteId', ParseUUIDPipe) siteId: string,
  ) {
    return this.sites.listLocations(organizationId, user.id, projectId, siteId);
  }

  @Post('sites/:siteId/locations')
  @RequiresCapability(Capability.ProjectsManage)
  createLocation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() body: CreateLocationDto,
  ) {
    return this.sites.createLocation(
      organizationId,
      user.id,
      projectId,
      siteId,
      body,
    );
  }

  @Get('locations/viewport')
  viewport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ViewportQueryDto,
  ) {
    return this.sites.viewport(organizationId, user.id, projectId, query);
  }
}
