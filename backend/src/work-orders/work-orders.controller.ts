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
  AddDependencyDto,
  AssignWorkOrderDto,
  CheckScheduleDto,
  CreateWorkOrderDto,
  TransitionWorkOrderDto,
  UpsertScheduleResourceDto,
} from './dto';
import { WorkOrdersService } from './work-orders.service';

@ApiTags('work orders')
@Controller('organizations/:organizationId/work-orders')
export class WorkOrdersController {
  constructor(private readonly workOrders: WorkOrdersService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Query('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.workOrders.list(organizationId, user.id, projectId);
  }

  @Get('dispatch')
  dispatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Query('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.workOrders.dispatch(organizationId, user.id, projectId);
  }

  @Post()
  @RequiresCapability(Capability.WorkOrdersCreate)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: CreateWorkOrderDto,
  ) {
    return this.workOrders.create(organizationId, user.id, body);
  }

  @Post(':workOrderId/assignments')
  @RequiresCapability(Capability.WorkOrdersAssign)
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('workOrderId', ParseUUIDPipe) workOrderId: string,
    @Body() body: AssignWorkOrderDto,
  ) {
    return this.workOrders.assign(organizationId, user.id, workOrderId, body);
  }

  @Post('schedule-resources')
  @RequiresCapability(Capability.WorkOrdersAssign)
  upsertScheduleResource(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: UpsertScheduleResourceDto,
  ) {
    return this.workOrders.upsertScheduleResource(
      organizationId,
      user.id,
      body,
    );
  }

  @Post(':workOrderId/schedule-checks')
  @RequiresCapability(Capability.WorkOrdersAssign)
  checkSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('workOrderId', ParseUUIDPipe) workOrderId: string,
    @Body() body: CheckScheduleDto,
  ) {
    return this.workOrders.checkSchedule(
      organizationId,
      user.id,
      workOrderId,
      body,
    );
  }

  @Post(':workOrderId/dependencies')
  @RequiresCapability(Capability.WorkOrdersCreate)
  dependency(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('workOrderId', ParseUUIDPipe) workOrderId: string,
    @Body() body: AddDependencyDto,
  ) {
    return this.workOrders.addDependency(
      organizationId,
      user.id,
      workOrderId,
      body,
    );
  }

  @Post(':workOrderId/transitions')
  @RequiresCapability(Capability.WorkOrdersComplete)
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('workOrderId', ParseUUIDPipe) workOrderId: string,
    @Body() body: TransitionWorkOrderDto,
  ) {
    return this.workOrders.transition(
      organizationId,
      user.id,
      workOrderId,
      body,
    );
  }
}
