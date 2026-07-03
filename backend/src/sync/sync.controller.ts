import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  ResolveConflictDto,
  SyncBootstrapDto,
  SyncPullDto,
  SyncPushDto,
} from './dto';
import { SyncService } from './sync.service';

@ApiTags('sync')
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('bootstrap')
  bootstrap(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SyncBootstrapDto,
  ) {
    return this.sync.bootstrap(body.organizationId, user.id, body);
  }

  @Post('push')
  push(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: SyncPushDto,
  ) {
    return this.sync.push(body.organizationId, user.id, idempotencyKey, body);
  }

  @Post('pull')
  pull(@CurrentUser() user: AuthenticatedUser, @Body() body: SyncPullDto) {
    return this.sync.pull(body.organizationId, user.id, body);
  }

  @Get('conflicts')
  conflicts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.sync.conflicts(organizationId, user.id);
  }

  @Post('conflicts/:conflictId/resolve')
  resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conflictId', ParseUUIDPipe) conflictId: string,
    @Body() body: ResolveConflictDto,
  ) {
    return this.sync.resolveConflict(
      body.organizationId,
      user.id,
      conflictId,
      body.resolution,
    );
  }
}
