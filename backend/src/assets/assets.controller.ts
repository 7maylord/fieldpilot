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
import { AssetsService } from './assets.service';
import {
  CreateAssetDto,
  CreateAssetTypeDto,
  CreateMeterReadingDto,
} from './dto';

@ApiTags('assets')
@Controller('organizations/:organizationId/assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}
  @Get('types') types(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.assets.types(organizationId, user.id);
  }
  @Post('types')
  @RequiresCapability(Capability.AssetsManage)
  createType(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: CreateAssetTypeDto,
  ) {
    return this.assets.createType(organizationId, user.id, body);
  }
  @Get('qr/:qrCode') lookup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('qrCode') qrCode: string,
  ) {
    return this.assets.byQr(organizationId, user.id, qrCode);
  }
  @Get() list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Query('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.assets.list(organizationId, user.id, projectId);
  }
  @Post()
  @RequiresCapability(Capability.AssetsManage)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: CreateAssetDto,
  ) {
    return this.assets.create(organizationId, user.id, body);
  }
  @Get(':assetId') get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ) {
    return this.assets.get(organizationId, user.id, assetId);
  }
  @Post(':assetId/meter-readings')
  @RequiresCapability(Capability.AssetsManage)
  reading(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Body() body: CreateMeterReadingDto,
  ) {
    return this.assets.addReading(organizationId, user.id, assetId, body);
  }
}
