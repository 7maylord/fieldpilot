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
import {
  CreateInspectionDto,
  ReviewInspectionDto,
  SaveInspectionDraftDto,
  SubmitInspectionDto,
} from './dto';
import { InspectionsService } from './inspections.service';

@ApiTags('inspections')
@Controller('organizations/:organizationId/inspections')
export class InspectionsController {
  constructor(private readonly inspections: InspectionsService) {}

  @Post()
  @RequiresCapability(Capability.InspectionsPerform)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: CreateInspectionDto,
  ) {
    return this.inspections.create(organizationId, user.id, body);
  }

  @Get(':inspectionId')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('inspectionId', ParseUUIDPipe) inspectionId: string,
  ) {
    return this.inspections.get(organizationId, user.id, inspectionId);
  }

  @Patch(':inspectionId/draft')
  @RequiresCapability(Capability.InspectionsPerform)
  save(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('inspectionId', ParseUUIDPipe) inspectionId: string,
    @Body() body: SaveInspectionDraftDto,
  ) {
    return this.inspections.saveDraft(
      organizationId,
      user.id,
      inspectionId,
      body,
    );
  }

  @Post(':inspectionId/submit')
  @RequiresCapability(Capability.InspectionsPerform)
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('inspectionId', ParseUUIDPipe) inspectionId: string,
    @Body() body: SubmitInspectionDto,
  ) {
    return this.inspections.submit(organizationId, user.id, inspectionId, body);
  }

  @Post(':inspectionId/reviews')
  @RequiresCapability(Capability.InspectionsApprove)
  review(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('inspectionId', ParseUUIDPipe) inspectionId: string,
    @Body() body: ReviewInspectionDto,
  ) {
    return this.inspections.review(organizationId, user.id, inspectionId, body);
  }
}
