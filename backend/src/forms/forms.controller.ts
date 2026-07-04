import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { Capability } from '../authorization/capability';
import { RequiresCapability } from '../authorization/capability.guard';
import {
  CreateFormTemplateDto,
  DuplicateFormTemplateDto,
  UpdateFormDraftDto,
} from './dto';
import { FormsService } from './forms.service';

@ApiTags('forms')
@Controller('organizations/:organizationId/form-templates')
export class FormsController {
  constructor(private readonly forms: FormsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.forms.list(organizationId, user.id);
  }

  @Post()
  @RequiresCapability(Capability.ProjectsManage)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: CreateFormTemplateDto,
  ) {
    return this.forms.create(organizationId, user.id, body);
  }

  @Patch(':templateId/draft')
  @RequiresCapability(Capability.ProjectsManage)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body() body: UpdateFormDraftDto,
  ) {
    return this.forms.updateDraft(organizationId, user.id, templateId, body);
  }

  @Post(':templateId/publish')
  @RequiresCapability(Capability.ProjectsManage)
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('templateId', ParseUUIDPipe) templateId: string,
  ) {
    return this.forms.publish(organizationId, user.id, templateId);
  }

  @Post(':templateId/duplicate')
  @RequiresCapability(Capability.ProjectsManage)
  duplicate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body() body: DuplicateFormTemplateDto,
  ) {
    return this.forms.duplicate(organizationId, user.id, templateId, body.name);
  }

  @Get('versions/:versionId/compare')
  compare(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Query('otherVersionId', ParseUUIDPipe) otherVersionId: string,
  ) {
    return this.forms.compare(
      organizationId,
      user.id,
      versionId,
      otherVersionId,
    );
  }
}
