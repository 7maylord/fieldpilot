import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { Capability } from '../authorization/capability';
import { RequiresCapability } from '../authorization/capability.guard';
import { DevicesService } from './devices.service';
import { RegisterDeviceDto, UpdateDeviceVersionDto } from './dto';

@ApiTags('devices')
@Controller('organizations/:organizationId/devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Post()
  register(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: RegisterDeviceDto,
  ) {
    return this.devices.register(organizationId, user.id, body);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.devices.list(organizationId, user.id);
  }

  @Post(':deviceId/heartbeat')
  heartbeat(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @Body() body: UpdateDeviceVersionDto,
  ) {
    return this.devices.touch(organizationId, user.id, deviceId, body);
  }

  @Post(':deviceId/package')
  renewPackage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
  ) {
    return this.devices.renewPackage(organizationId, user.id, deviceId);
  }

  @Get(':deviceId/status')
  status(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
  ) {
    return this.devices.status(organizationId, user.id, deviceId);
  }

  @Post(':deviceId/revoke')
  @RequiresCapability(Capability.OrganizationManage)
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
  ) {
    return this.devices.revoke(organizationId, user.id, deviceId);
  }

  @Post(':deviceId/purge')
  @RequiresCapability(Capability.OrganizationManage)
  requestPurge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
  ) {
    return this.devices.requestPurge(organizationId, user.id, deviceId);
  }

  @Post(':deviceId/purge/acknowledge')
  acknowledgePurge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
  ) {
    return this.devices.acknowledgePurge(organizationId, user.id, deviceId);
  }
}
