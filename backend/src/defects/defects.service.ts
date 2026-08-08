import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { newId } from '../common/id';
import { TenantDatabase } from '../database/tenant-database.service';
import { assertDefectTransition, type DefectStatus } from './defect-state';
import type {
  AssignDefectDto,
  CreateDefectDto,
  SubmitCorrectionDto,
  TransitionDefectDto,
  VerifyCorrectionDto,
} from './dto';

@Injectable()
export class DefectsService {
  constructor(
    private readonly tenants: TenantDatabase,
    private readonly audit: AuditService,
  ) {}

  list(organizationId: string, userId: string, projectId: string) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        await this.assertProjectAccess(tx, organizationId, userId, projectId);
        return tx.defect.findMany({
          where: { organizationId, projectId },
          include: {
            assignments: true,
            corrections: { include: { verifications: true } },
            statusEvents: true,
          },
          orderBy: { updatedAt: 'desc' },
        });
      },
    );
  }

  create(organizationId: string, actorId: string, input: CreateDefectDto) {
    return this.tenants.withMembership(
      { organizationId, userId: actorId },
      (tx) =>
        this.createInTransaction(tx, organizationId, actorId, input, newId()),
    );
  }

  async createInTransaction(
    tx: Prisma.TransactionClient,
    organizationId: string,
    actorId: string,
    input: CreateDefectDto,
    id: string,
  ) {
    await this.assertProjectAccess(
      tx,
      organizationId,
      actorId,
      input.projectId,
    );
    if (
      input.locationId &&
      !(await tx.location.findFirst({
        where: {
          id: input.locationId,
          organizationId,
          projectId: input.projectId,
        },
      }))
    )
      throw new BadRequestException('Location must belong to the project');
    if (
      input.assetId &&
      !(await tx.asset.findFirst({
        where: {
          id: input.assetId,
          organizationId,
          projectId: input.projectId,
        },
      }))
    )
      throw new BadRequestException('Asset must belong to the project');
    const defect = await tx.defect.create({
      data: {
        id,
        organizationId,
        projectId: input.projectId,
        locationId: input.locationId,
        inspectionId: input.inspectionId,
        workOrderId: input.workOrderId,
        assetId: input.assetId,
        category: input.category.trim(),
        severity: input.severity,
        title: input.title.trim(),
        description: input.description,
        dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
        createdBy: actorId,
        statusEvents: {
          create: {
            id: newId(),
            organizationId,
            toStatus: 'reported',
            actorId,
          },
        },
      },
    });
    await this.record(
      tx,
      organizationId,
      actorId,
      defect.id,
      'defect.reported',
    );
    return defect;
  }

  assign(
    organizationId: string,
    actorId: string,
    defectId: string,
    input: AssignDefectDto,
  ) {
    return this.tenants.withMembership(
      { organizationId, userId: actorId },
      async (tx) => {
        const defect = await this.get(tx, organizationId, defectId);
        if (defect.status !== 'triaged')
          throw new BadRequestException('Only triaged defects can be assigned');
        const exists =
          input.assigneeType === 'team'
            ? await tx.team.findFirst({
                where: { id: input.assigneeId, organizationId },
              })
            : await tx.membership.findUnique({
                where: {
                  organizationId_userId: {
                    organizationId,
                    userId: input.assigneeId,
                  },
                },
              });
        if (!exists)
          throw new BadRequestException(
            'Assignee does not belong to the organization',
          );
        const assignment = await tx.defectAssignment.create({
          data: {
            id: newId(),
            organizationId,
            defectId,
            assigneeType: input.assigneeType,
            assigneeId: input.assigneeId,
            assignedBy: actorId,
          },
        });
        await this.changeStatus(tx, defect, actorId, input.version, 'assigned');
        await this.record(
          tx,
          organizationId,
          actorId,
          defectId,
          'defect.assigned',
        );
        return assignment;
      },
    );
  }

  transition(
    organizationId: string,
    actorId: string,
    defectId: string,
    input: TransitionDefectDto,
  ) {
    return this.tenants.withMembership(
      { organizationId, userId: actorId },
      async (tx) => {
        const defect = await this.get(tx, organizationId, defectId);
        if (
          input.status === 'assigned' &&
          !(await tx.defectAssignment.count({ where: { defectId } }))
        )
          throw new BadRequestException('An assignment is required');
        await this.changeStatus(
          tx,
          defect,
          actorId,
          input.version,
          input.status,
          input.comment,
        );
        await this.record(
          tx,
          organizationId,
          actorId,
          defectId,
          `defect.${input.status}`,
        );
        return tx.defect.findUniqueOrThrow({ where: { id: defectId } });
      },
    );
  }

  correct(
    organizationId: string,
    actorId: string,
    defectId: string,
    input: SubmitCorrectionDto,
  ) {
    return this.tenants.withMembership(
      { organizationId, userId: actorId },
      async (tx) => {
        const defect = await this.get(tx, organizationId, defectId);
        if (defect.status !== 'correction_in_progress')
          throw new BadRequestException('Defect is not accepting a correction');
        const evidence = await tx.mediaObject.findMany({
          where: {
            id: { in: input.evidenceIds },
            organizationId,
            projectId: defect.projectId,
            status: 'ready',
            links: { some: { entityType: 'defect', entityId: defectId } },
          },
          select: { id: true },
        });
        if (evidence.length !== new Set(input.evidenceIds).size)
          throw new BadRequestException(
            'Correction evidence is missing or unavailable',
          );
        const correction = await tx.defectCorrection.create({
          data: {
            id: newId(),
            organizationId,
            defectId,
            rootCause: input.rootCause.trim(),
            correctiveAction: input.correctiveAction.trim(),
            evidenceIds: input.evidenceIds,
            submittedBy: actorId,
          },
        });
        await tx.mediaObject.updateMany({
          where: { id: { in: input.evidenceIds }, organizationId },
          data: { immutableAt: new Date() },
        });
        await this.changeStatus(
          tx,
          defect,
          actorId,
          input.version,
          'ready_for_verification',
        );
        await this.record(
          tx,
          organizationId,
          actorId,
          defectId,
          'defect.correction_submitted',
        );
        return correction;
      },
    );
  }

  verify(
    organizationId: string,
    actorId: string,
    defectId: string,
    input: VerifyCorrectionDto,
  ) {
    return this.tenants.withMembership(
      { organizationId, userId: actorId },
      async (tx) => {
        const defect = await this.get(tx, organizationId, defectId);
        if (defect.status !== 'ready_for_verification')
          throw new BadRequestException('Defect is not ready for verification');
        const correction = await tx.defectCorrection.findFirst({
          where: { id: input.correctionId, defectId, organizationId },
        });
        if (!correction)
          throw new BadRequestException(
            'Correction does not belong to the defect',
          );
        const verification = await tx.defectVerification.create({
          data: {
            id: newId(),
            organizationId,
            correctionId: correction.id,
            verifierId: actorId,
            decision: input.decision,
            comment: input.comment,
          },
        });
        await this.changeStatus(
          tx,
          defect,
          actorId,
          input.version,
          input.decision === 'verified' ? 'verified' : 'correction_in_progress',
          input.comment,
        );
        await this.record(
          tx,
          organizationId,
          actorId,
          defectId,
          `defect.${input.decision}`,
        );
        return verification;
      },
    );
  }

  private async get(
    tx: Prisma.TransactionClient,
    organizationId: string,
    defectId: string,
  ) {
    const defect = await tx.defect.findFirst({
      where: { id: defectId, organizationId },
    });
    if (!defect) throw new NotFoundException('Defect not found');
    return defect;
  }

  private async changeStatus(
    tx: Prisma.TransactionClient,
    defect: Awaited<ReturnType<DefectsService['get']>>,
    actorId: string,
    version: number,
    status: DefectStatus,
    comment?: string,
  ) {
    assertDefectTransition(defect.status, status);
    const updated = await tx.defect.updateMany({
      where: {
        id: defect.id,
        organizationId: defect.organizationId,
        version,
        status: defect.status,
      },
      data: { status, version: { increment: 1 } },
    });
    if (!updated.count) throw new ConflictException('Defect version is stale');
    await tx.defectStatusEvent.create({
      data: {
        id: newId(),
        organizationId: defect.organizationId,
        defectId: defect.id,
        fromStatus: defect.status,
        toStatus: status,
        actorId,
        comment,
      },
    });
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
    const project = await tx.project.findFirst({
      where: {
        id: projectId,
        organizationId,
        ...(membership.isExternal ? { access: { some: { userId } } } : {}),
      },
    });
    if (!project) throw new ForbiddenException('Project access denied');
  }

  private async record(
    tx: Prisma.TransactionClient,
    organizationId: string,
    actorId: string,
    defectId: string,
    action: string,
  ) {
    await this.audit.write(tx, {
      organizationId,
      actorId,
      action,
      resourceType: 'defect',
      resourceId: defectId,
    });
    await this.audit.enqueue(tx, {
      organizationId,
      eventType: action,
      aggregateId: defectId,
      payload: { defectId },
    });
  }
}
