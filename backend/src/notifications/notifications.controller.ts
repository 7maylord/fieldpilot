import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { NotificationsService } from './notifications.service';
import { NotificationStream } from './notification-stream.service';

@ApiTags('notifications')
@Controller('organizations/:organizationId/notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly stream: NotificationStream,
  ) {}

  @Get('stream')
  openStream(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    this.stream.open(request, response, organizationId, user.id);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.notifications.list(organizationId, user.id);
  }

  @Patch(':notificationId/read')
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ) {
    return this.notifications.markRead(organizationId, user.id, notificationId);
  }
}
