import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { newId } from '../common/id';
import { TenantDatabase } from '../database/tenant-database.service';
import type {
  CreateDailyReportDto,
  CreateReportRevisionDto,
  ReviewReportDto,
  SignReportDto,
} from './dto';
import { renderCsv, renderPdf } from './report-export';

@Injectable()
export class ReportsService {
  constructor(
    private readonly tenants: TenantDatabase,
    private readonly audit: AuditService,
  ) {}
  list(organizationId: string, userId: string, projectId: string) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        await this.assertProjectAccess(tx, organizationId, userId, projectId);
        return tx.dailyReport.findMany({
          where: { organizationId, projectId },
          include: {
            versions: {
              include: { reviews: true, signatures: true },
              orderBy: { revision: 'desc' },
            },
          },
          orderBy: { reportDate: 'desc' },
        });
      },
    );
  }
  create(organizationId: string, userId: string, input: CreateDailyReportDto) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        await this.assertProjectAccess(
          tx,
          organizationId,
          userId,
          input.projectId,
        );
        const startsAt = new Date(
          `${input.reportDate.slice(0, 10)}T00:00:00.000Z`,
        );
        const endsAt = new Date(startsAt.getTime() + 86_400_000);
        const [workOrders, inspections, defects, assignments] =
          await Promise.all([
            tx.workOrder.findMany({
              where: {
                organizationId,
                projectId: input.projectId,
                updatedAt: { gte: startsAt, lt: endsAt },
              },
              select: { id: true, title: true, status: true },
            }),
            tx.inspection.findMany({
              where: {
                organizationId,
                projectId: input.projectId,
                updatedAt: { gte: startsAt, lt: endsAt },
              },
              select: { id: true, status: true, inspectionType: true },
            }),
            tx.defect.findMany({
              where: {
                organizationId,
                projectId: input.projectId,
                updatedAt: { gte: startsAt, lt: endsAt },
              },
              select: { id: true, title: true, status: true, severity: true },
            }),
            tx.workOrderAssignment.findMany({
              where: {
                organizationId,
                workOrder: {
                  projectId: input.projectId,
                  plannedStart: { lt: endsAt },
                  plannedEnd: { gte: startsAt },
                },
              },
              select: { id: true, assigneeId: true, assigneeType: true },
            }),
          ]);
        const equipment = assignments.filter(
          ({ assigneeType }) => assigneeType === 'equipment',
        );
        const sources = [
          ...workOrders.map(({ id }) => ({ type: 'work_order', id })),
          ...inspections.map(({ id }) => ({ type: 'inspection', id })),
          ...defects.map(({ id }) => ({ type: 'defect', id })),
          ...equipment.map(({ id }) => ({ type: 'equipment_assignment', id })),
        ];
        const reportId = newId();
        const content = {
          weatherNotes: input.weatherNotes ?? '',
          supervisorNotes: input.supervisorNotes ?? '',
          workforceCount: new Set(
            assignments
              .filter(({ assigneeType }) => assigneeType !== 'equipment')
              .map(({ assigneeId }) => assigneeId),
          ).size,
          equipmentUsage: equipment,
          completedWork: workOrders.filter(
            ({ status }) => status === 'completed',
          ),
          delays: workOrders.filter(({ status }) => status === 'blocked'),
          inspections,
          defects,
          safetyEvents: [],
          materials: [],
          photos: [],
        };
        const report = await tx.dailyReport.create({
          data: {
            id: reportId,
            organizationId,
            projectId: input.projectId,
            reportDate: startsAt,
            createdBy: userId,
            versions: {
              create: {
                id: newId(),
                organizationId,
                revision: 1,
                content,
                sourceReferences: sources,
                createdBy: userId,
              },
            },
          },
          include: { versions: true },
        });
        await this.record(
          tx,
          organizationId,
          userId,
          reportId,
          'daily_report.draft_created',
        );
        return report;
      },
    );
  }
  revise(
    organizationId: string,
    userId: string,
    reportId: string,
    input: CreateReportRevisionDto,
  ) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        const report = await this.get(tx, organizationId, reportId);
        const latest = await tx.dailyReportVersion.findUniqueOrThrow({
          where: {
            reportId_revision: { reportId, revision: report.currentRevision },
          },
        });
        const revision = report.currentRevision + 1;
        const version = await tx.dailyReportVersion.create({
          data: {
            id: newId(),
            organizationId,
            reportId,
            revision,
            content: input.content as Prisma.InputJsonValue,
            sourceReferences: latest.sourceReferences as Prisma.InputJsonValue,
            createdBy: userId,
          },
        });
        await tx.dailyReport.update({
          where: { id: reportId },
          data: { currentRevision: revision, status: 'draft' },
        });
        await this.record(
          tx,
          organizationId,
          userId,
          reportId,
          'daily_report.revised',
        );
        return version;
      },
    );
  }
  review(
    organizationId: string,
    userId: string,
    reportId: string,
    input: ReviewReportDto,
  ) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        const report = await this.get(tx, organizationId, reportId);
        const version = await tx.dailyReportVersion.findUniqueOrThrow({
          where: {
            reportId_revision: { reportId, revision: report.currentRevision },
          },
        });
        const review = await tx.reportReview.create({
          data: {
            id: newId(),
            organizationId,
            versionId: version.id,
            reviewerId: userId,
            decision: input.decision,
            comment: input.comment,
          },
        });
        await tx.dailyReport.update({
          where: { id: reportId },
          data: {
            status: input.decision === 'approved' ? 'approved' : 'draft',
          },
        });
        return review;
      },
    );
  }
  sign(
    organizationId: string,
    userId: string,
    reportId: string,
    input: SignReportDto,
  ) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        const report = await this.get(tx, organizationId, reportId);
        const version = await tx.dailyReportVersion.findUniqueOrThrow({
          where: {
            reportId_revision: { reportId, revision: report.currentRevision },
          },
        });
        const media = await tx.mediaObject.findFirst({
          where: {
            id: input.mediaId,
            organizationId,
            projectId: report.projectId,
            status: 'ready',
            mimeType: { in: ['image/png', 'image/jpeg'] },
            links: { some: { entityType: 'daily_report', entityId: reportId } },
          },
        });
        if (!media)
          throw new BadRequestException('A ready report signature is required');
        const signature = await tx.reportSignature.create({
          data: {
            id: newId(),
            organizationId,
            versionId: version.id,
            signerId: userId,
            mediaId: media.id,
          },
        });
        await tx.mediaObject.update({
          where: { id: media.id },
          data: { immutableAt: new Date() },
        });
        return signature;
      },
    );
  }
  publish(organizationId: string, userId: string, reportId: string) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        const report = await this.get(tx, organizationId, reportId);
        const version = await tx.dailyReportVersion.findUniqueOrThrow({
          where: {
            reportId_revision: { reportId, revision: report.currentRevision },
          },
          include: { reviews: true, signatures: true },
        });
        if (
          !version.reviews.some(({ decision }) => decision === 'approved') ||
          !version.signatures.length
        )
          throw new BadRequestException(
            'Publication requires approval and signature',
          );
        await tx.dailyReportVersion.update({
          where: { id: version.id },
          data: { publishedAt: new Date() },
        });
        const published = await tx.dailyReport.update({
          where: { id: reportId },
          data: { status: 'published' },
        });
        await this.record(
          tx,
          organizationId,
          userId,
          reportId,
          'daily_report.published',
        );
        return published;
      },
    );
  }
  export(
    organizationId: string,
    userId: string,
    reportId: string,
    format: 'pdf' | 'csv',
  ) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        const report = await this.get(tx, organizationId, reportId);
        await this.assertProjectAccess(
          tx,
          organizationId,
          userId,
          report.projectId,
        );
        const version = await tx.dailyReportVersion.findFirst({
          where: { reportId, organizationId, publishedAt: { not: null } },
          orderBy: { revision: 'desc' },
        });
        if (!version)
          throw new BadRequestException(
            'Only published reports can be exported',
          );
        const content = version.content as Record<string, unknown>;
        return format === 'pdf'
          ? renderPdf(
              `FieldPilot daily report ${report.reportDate.toISOString().slice(0, 10)}`,
              content,
            )
          : Buffer.from(renderCsv(content));
      },
    );
  }

  private async get(
    tx: Prisma.TransactionClient,
    organizationId: string,
    reportId: string,
  ) {
    const report = await tx.dailyReport.findFirst({
      where: { id: reportId, organizationId },
    });
    if (!report) throw new NotFoundException('Daily report not found');
    return report;
  }
  private async assertProjectAccess(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    projectId: string,
  ) {
    const membership = await tx.membership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (
      !(await tx.project.findFirst({
        where: {
          id: projectId,
          organizationId,
          ...(membership.isExternal ? { access: { some: { userId } } } : {}),
        },
      }))
    )
      throw new ForbiddenException('Project access denied');
  }
  private async record(
    tx: Prisma.TransactionClient,
    organizationId: string,
    actorId: string,
    reportId: string,
    action: string,
  ) {
    await this.audit.write(tx, {
      organizationId,
      actorId,
      action,
      resourceType: 'daily_report',
      resourceId: reportId,
    });
    await this.audit.enqueue(tx, {
      organizationId,
      eventType: action,
      aggregateId: reportId,
      payload: { reportId },
    });
  }
}
