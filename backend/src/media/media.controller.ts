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
import { CompleteUploadDto, CreateUploadSessionDto } from './dto';
import { MediaService } from './media.service';

@ApiTags('media')
@Controller('organizations/:organizationId/media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Query('projectId', ParseUUIDPipe) projectId: string,
    @Query('entityType') entityType: string,
    @Query('entityId', ParseUUIDPipe) entityId: string,
  ) {
    return this.media.listForEntity(
      organizationId,
      user.id,
      projectId,
      entityType,
      entityId,
    );
  }

  @Post('upload-sessions')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: CreateUploadSessionDto,
  ) {
    return this.media.createSession(organizationId, user.id, body);
  }

  @Get('upload-sessions/:sessionId')
  resume(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.media.resume(organizationId, user.id, sessionId);
  }

  @Post('upload-sessions/:sessionId/complete')
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: CompleteUploadDto,
  ) {
    return this.media.complete(organizationId, user.id, sessionId, body);
  }

  @Get(':mediaId/url')
  url(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
  ) {
    return this.media.signedUrl(organizationId, user.id, mediaId);
  }
}
