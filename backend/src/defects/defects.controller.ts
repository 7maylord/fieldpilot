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
import {
  AssignDefectDto,
  CreateDefectDto,
  SubmitCorrectionDto,
  TransitionDefectDto,
  VerifyCorrectionDto,
} from './dto';
import { DefectsService } from './defects.service';

@ApiTags('defects')
@Controller('organizations/:organizationId/defects')
export class DefectsController {
  constructor(private readonly defects: DefectsService) {}
  @Get() list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Query('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.defects.list(organizationId, user.id, projectId);
  }
  @Post()
  @RequiresCapability(Capability.DefectsCreate)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: CreateDefectDto,
  ) {
    return this.defects.create(organizationId, user.id, body);
  }
  @Post(':defectId/assignments')
  @RequiresCapability(Capability.DefectsAssign)
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('defectId', ParseUUIDPipe) defectId: string,
    @Body() body: AssignDefectDto,
  ) {
    return this.defects.assign(organizationId, user.id, defectId, body);
  }
  @Post(':defectId/transitions')
  @RequiresCapability(Capability.DefectsCreate)
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('defectId', ParseUUIDPipe) defectId: string,
    @Body() body: TransitionDefectDto,
  ) {
    return this.defects.transition(organizationId, user.id, defectId, body);
  }
  @Post(':defectId/corrections')
  @RequiresCapability(Capability.DefectsCreate)
  correct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('defectId', ParseUUIDPipe) defectId: string,
    @Body() body: SubmitCorrectionDto,
  ) {
    return this.defects.correct(organizationId, user.id, defectId, body);
  }
  @Post(':defectId/verifications')
  @RequiresCapability(Capability.DefectsVerify)
  verify(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('defectId', ParseUUIDPipe) defectId: string,
    @Body() body: VerifyCorrectionDto,
  ) {
    return this.defects.verify(organizationId, user.id, defectId, body);
  }
}
