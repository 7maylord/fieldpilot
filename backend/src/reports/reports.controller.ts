import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  Header,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { Capability } from '../authorization/capability';
import { RequiresCapability } from '../authorization/capability.guard';
import {
  CreateDailyReportDto,
  CreateReportRevisionDto,
  ReviewReportDto,
  SignReportDto,
} from './dto';
import { ReportsService } from './reports.service';

@ApiTags('daily reports')
@Controller('organizations/:organizationId/daily-reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get() list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Query('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.reports.list(organizationId, user.id, projectId);
  }
  @Post()
  @RequiresCapability(Capability.ReportsPublish)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: CreateDailyReportDto,
  ) {
    return this.reports.create(organizationId, user.id, body);
  }
  @Patch(':reportId/revisions')
  @RequiresCapability(Capability.ReportsPublish)
  revise(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() body: CreateReportRevisionDto,
  ) {
    return this.reports.revise(organizationId, user.id, reportId, body);
  }
  @Post(':reportId/reviews')
  @RequiresCapability(Capability.ReportsPublish)
  review(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() body: ReviewReportDto,
  ) {
    return this.reports.review(organizationId, user.id, reportId, body);
  }
  @Post(':reportId/signatures')
  @RequiresCapability(Capability.ReportsPublish)
  sign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() body: SignReportDto,
  ) {
    return this.reports.sign(organizationId, user.id, reportId, body);
  }
  @Post(':reportId/publish')
  @RequiresCapability(Capability.ReportsPublish)
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('reportId', ParseUUIDPipe) reportId: string,
  ) {
    return this.reports.publish(organizationId, user.id, reportId);
  }

  @Get(':reportId/export.pdf')
  @Header('Content-Type', 'application/pdf')
  async pdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('reportId', ParseUUIDPipe) reportId: string,
  ) {
    return new StreamableFile(
      await this.reports.export(organizationId, user.id, reportId, 'pdf'),
    );
  }

  @Get(':reportId/export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async csv(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('reportId', ParseUUIDPipe) reportId: string,
  ) {
    return new StreamableFile(
      await this.reports.export(organizationId, user.id, reportId, 'csv'),
    );
  }
}
