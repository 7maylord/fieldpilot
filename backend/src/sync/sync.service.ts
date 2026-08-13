import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { validate as validateUuid } from 'uuid';
import { AssetsService } from '../assets/assets.service';
import { CreateAssetDto } from '../assets/dto';
import { AuditService } from '../audit/audit.service';
import { Capability, hasCapability } from '../authorization/capability';
import { newId } from '../common/id';
import { TenantDatabase } from '../database/tenant-database.service';
import { CreateDefectDto } from '../defects/dto';
import { DefectsService } from '../defects/defects.service';
import {
  assertWorkOrderTransition,
  type WorkOrderStatus,
} from '../work-orders/work-order-state';
import { syncOutcome } from './conflict-strategy';
import { nextCheckpointSequence } from './checkpoint';
import { evaluateForm, type FormSchema } from '../forms/form-schema';
import { MetricsService } from '../metrics/metrics.service';
import type {
  SyncBootstrapDto,
  SyncOperationDto,
  SyncPullDto,
  SyncPushDto,
} from './dto';

const supportedOperations = new Set([
  'update',
  'status_transition',
  'assignment',
  'comment_append',
  'media_append',
  'checklist_field_update',
  'defect_create',
  'asset_create',
  'form_submission_create',
]);

@Injectable()
export class SyncService {
  constructor(
    private readonly tenants: TenantDatabase,
    private readonly audit: AuditService,
    private readonly metrics: MetricsService,
    private readonly defects: DefectsService,
    private readonly assets: AssetsService,
  ) {}

  bootstrap(organizationId: string, userId: string, input: SyncBootstrapDto) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        const device = await this.authorizedDevice(
          tx,
          organizationId,
          userId,
          input.deviceId,
        );
        if (
          input.lastCheckpoint &&
          input.lastCheckpoint !== device.currentCheckpoint
        )
          throw new ConflictException('Sync checkpoint is stale');
        const membership = await tx.membership.findUniqueOrThrow({
          where: { organizationId_userId: { organizationId, userId } },
        });
        const projects = await tx.project.findMany({
          where: {
            organizationId,
            id: { in: input.projectIds },
            ...(membership.isExternal ? { access: { some: { userId } } } : {}),
          },
        });
        if (projects.length !== new Set(input.projectIds).size)
          throw new ForbiddenException('Project access denied');
        const projectIds = projects.map(({ id }) => id);
        const [
          sites,
          locations,
          workOrders,
          formVersions,
          inspections,
          latest,
        ] = await Promise.all([
          tx.site.findMany({
            where: { organizationId, projectId: { in: projectIds } },
          }),
          tx.location.findMany({
            where: { organizationId, projectId: { in: projectIds } },
            select: {
              id: true,
              organizationId: true,
              projectId: true,
              siteId: true,
              parentId: true,
              name: true,
              locationType: true,
              status: true,
              chainageStart: true,
              chainageEnd: true,
              version: true,
              updatedAt: true,
            },
          }),
          tx.workOrder.findMany({
            where: { organizationId, projectId: { in: projectIds } },
            include: { assignments: true },
          }),
          tx.formVersion.findMany({
            where: { organizationId, status: 'published' },
          }),
          tx.inspection.findMany({
            where: {
              organizationId,
              projectId: { in: projectIds },
              inspectorId: userId,
            },
          }),
          tx.entityChangeLog.aggregate({
            where: { organizationId },
            _max: { sequence: true },
          }),
        ]);
        const checkpoint = newId();
        await tx.syncCheckpoint.create({
          data: {
            token: checkpoint,
            organizationId,
            deviceId: device.id,
            sequence: latest._max.sequence ?? 0n,
            projectIds,
          },
        });
        await tx.syncDevice.update({
          where: { id: device.id },
          data: { currentCheckpoint: checkpoint, lastSeenAt: new Date() },
        });
        await this.audit.write(tx, {
          organizationId,
          actorId: userId,
          action: 'sync.bootstrap_created',
          resourceType: 'sync_device',
          resourceId: device.id,
          summary: { projectIds },
        });
        return {
          checkpoint,
          serverTime: new Date(),
          packageExpiresAt: device.packageExpiresAt,
          projects,
          sites,
          locations,
          workOrders,
          formVersions: formVersions.map((version) => ({
            ...version,
            version: version.versionNumber,
          })),
          inspections,
          assets: [],
          referenceData: [],
        };
      },
    );
  }

  push(
    organizationId: string,
    userId: string,
    idempotencyKey: string | undefined,
    input: SyncPushDto,
  ) {
    if (!idempotencyKey || !validateUuid(idempotencyKey))
      throw new BadRequestException('A UUID Idempotency-Key is required');
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        await this.authorizedDevice(tx, organizationId, userId, input.deviceId);
        const results = [];
        for (const operation of input.operations)
          results.push(
            await this.applyOperation(
              tx,
              organizationId,
              userId,
              input.deviceId,
              operation,
            ),
          );
        for (const result of results)
          this.metrics.domain.inc({
            area: result.status === 'conflict' ? 'conflicts' : 'sync',
            outcome: result.status,
          });
        return { batchId: idempotencyKey, serverTime: new Date(), results };
      },
    );
  }

  pull(organizationId: string, userId: string, input: SyncPullDto) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        await this.authorizedDevice(tx, organizationId, userId, input.deviceId);
        const checkpoint = await tx.syncCheckpoint.findFirst({
          where: {
            token: input.checkpoint,
            organizationId,
            deviceId: input.deviceId,
          },
        });
        if (!checkpoint)
          throw new ConflictException('Sync checkpoint is invalid');
        const rows = await tx.entityChangeLog.findMany({
          where: {
            organizationId,
            sequence: { gt: checkpoint.sequence },
            projectId: { in: checkpoint.projectIds },
          },
          orderBy: { sequence: 'asc' },
          take: input.limit + 1,
        });
        const hasMore = rows.length > input.limit;
        const changes = rows.slice(0, input.limit);
        const nextSequence = nextCheckpointSequence(
          checkpoint.sequence,
          changes.map(({ sequence }) => sequence),
        );
        const nextCheckpoint = newId();
        await tx.syncCheckpoint.create({
          data: {
            token: nextCheckpoint,
            organizationId,
            deviceId: input.deviceId,
            sequence: nextSequence,
            projectIds: checkpoint.projectIds,
          },
        });
        await tx.syncDevice.update({
          where: { id: input.deviceId },
          data: { currentCheckpoint: nextCheckpoint, lastSeenAt: new Date() },
        });
        return {
          changes: changes.map(({ sequence, ...change }) => ({
            ...change,
            sequence: sequence.toString(),
          })),
          nextCheckpoint,
          hasMore,
        };
      },
    );
  }

  conflicts(organizationId: string, userId: string) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        await this.assertCoordinator(tx, organizationId, userId);
        return tx.syncConflict.findMany({
          where: { organizationId, status: 'unresolved' },
          orderBy: { createdAt: 'asc' },
        });
      },
    );
  }

  resolveConflict(
    organizationId: string,
    userId: string,
    conflictId: string,
    resolution: Record<string, unknown>,
  ) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        await this.assertCoordinator(tx, organizationId, userId);
        const conflict = await tx.syncConflict.findFirst({
          where: { id: conflictId, organizationId, status: 'unresolved' },
        });
        if (!conflict) throw new NotFoundException('Conflict not found');
        const choice = resolution.choice;
        if (choice !== 'local' && choice !== 'server')
          throw new BadRequestException(
            'Resolution choice must be local or server',
          );
        if (choice === 'local')
          await this.applyConflictResolution(
            tx,
            organizationId,
            userId,
            conflict,
          );
        const resolved = await tx.syncConflict.update({
          where: { id: conflictId },
          data: {
            status: 'resolved',
            resolution: resolution as Prisma.InputJsonValue,
            resolvedBy: userId,
            resolvedAt: new Date(),
          },
        });
        await this.audit.write(tx, {
          organizationId,
          actorId: userId,
          action: 'sync.conflict_resolved',
          resourceType: 'sync_conflict',
          resourceId: conflictId,
          summary: resolution as Prisma.InputJsonValue,
        });
        return resolved;
      },
    );
  }

  private async applyConflictResolution(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    conflict: {
      entityType: string;
      entityId: string;
      operationType: string;
      localValue: Prisma.JsonValue;
    },
  ) {
    const payload = conflict.localValue as Record<string, unknown>;
    let projectId = this.payloadUuid(payload.projectId);
    let version: number | undefined;
    if (conflict.entityType === 'work_order') {
      const workOrder = await tx.workOrder.findFirstOrThrow({
        where: { id: conflict.entityId, organizationId },
      });
      projectId = workOrder.projectId;
      if (conflict.operationType === 'status_transition')
        assertWorkOrderTransition(
          workOrder.status,
          payload.status as WorkOrderStatus,
        );
      const data: Prisma.WorkOrderUpdateInput = {
        version: { increment: 1 },
        ...(conflict.operationType === 'status_transition'
          ? { status: payload.status as string }
          : conflict.operationType === 'update'
            ? {
                ...(typeof payload.title === 'string'
                  ? { title: payload.title }
                  : {}),
                ...(typeof payload.description === 'string'
                  ? { description: payload.description }
                  : {}),
              }
            : {}),
      };
      const updated = await tx.workOrder.update({
        where: { id: workOrder.id },
        data,
      });
      version = updated.version;
      if (conflict.operationType === 'assignment') {
        const assigneeId = this.payloadUuid(payload.assigneeId);
        if (!assigneeId || typeof payload.assigneeType !== 'string')
          throw new BadRequestException('Assignment resolution is invalid');
        const assignee =
          payload.assigneeType === 'user'
            ? await tx.membership.findUnique({
                where: {
                  organizationId_userId: { organizationId, userId: assigneeId },
                },
              })
            : payload.assigneeType === 'team'
              ? await tx.team.findFirst({
                  where: { id: assigneeId, organizationId },
                })
              : null;
        if (!assignee)
          throw new BadRequestException('Assignment target is invalid');
        await tx.workOrderAssignment.create({
          data: {
            id: newId(),
            organizationId,
            workOrderId: workOrder.id,
            assigneeType: payload.assigneeType,
            assigneeId,
            createdBy: userId,
          },
        });
      }
    }
    await tx.entityChangeLog.create({
      data: {
        organizationId,
        projectId,
        entityType: conflict.entityType,
        entityId: conflict.entityId,
        operationType: 'conflict_resolution',
        version,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  }

  private async applyOperation(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    deviceId: string,
    operation: SyncOperationDto,
  ) {
    const existing = await tx.syncOperation.findUnique({
      where: {
        organizationId_deviceId_clientOperationId: {
          organizationId,
          deviceId,
          clientOperationId: operation.operationId,
        },
      },
    });
    if (existing)
      return { operationId: operation.operationId, status: 'already_applied' };

    const workOrder =
      operation.entityType === 'work_order'
        ? await tx.workOrder.findFirst({
            where: { id: operation.entityId, organizationId },
          })
        : null;
    const inspection =
      operation.entityType === 'inspection'
        ? await tx.inspection.findFirst({
            where: { id: operation.entityId, organizationId },
          })
        : null;
    if (!supportedOperations.has(operation.operationType))
      return this.storeOutcome(
        tx,
        organizationId,
        userId,
        deviceId,
        operation,
        'rejected',
        {
          rejectionCode: 'UNSUPPORTED_OPERATION',
        },
      );
    if (operation.entityType === 'defect') {
      if (operation.operationType !== 'defect_create')
        return this.storeOutcome(
          tx,
          organizationId,
          userId,
          deviceId,
          operation,
          'rejected',
          { rejectionCode: 'UNSUPPORTED_OPERATION' },
        );

      const membership = await tx.membership.findUniqueOrThrow({
        where: { organizationId_userId: { organizationId, userId } },
      });
      if (
        !hasCapability(
          membership.role,
          membership.isExternal,
          Capability.DefectsCreate,
        )
      )
        return this.storeOutcome(
          tx,
          organizationId,
          userId,
          deviceId,
          operation,
          'rejected',
          { rejectionCode: 'FORBIDDEN' },
        );

      const payload = plainToInstance(CreateDefectDto, operation.payload);
      const errors = await validate(payload, { whitelist: true });
      if (errors.length)
        return this.storeOutcome(
          tx,
          organizationId,
          userId,
          deviceId,
          operation,
          'rejected',
          { rejectionCode: 'VALIDATION_FAILED' },
        );

      const existingDefect = await tx.defect.findUnique({
        where: { id: operation.entityId },
      });
      if (existingDefect)
        return this.storeOutcome(
          tx,
          organizationId,
          userId,
          deviceId,
          operation,
          'already_applied',
        );

      try {
        await this.defects.createInTransaction(
          tx,
          organizationId,
          userId,
          payload,
          operation.entityId,
        );
      } catch {
        return this.storeOutcome(
          tx,
          organizationId,
          userId,
          deviceId,
          operation,
          'rejected',
          { rejectionCode: 'ENTITY_NOT_FOUND' },
        );
      }
      return this.storeOutcome(
        tx,
        organizationId,
        userId,
        deviceId,
        operation,
        'applied',
      );
    }
    if (operation.entityType === 'asset') {
      if (operation.operationType !== 'asset_create')
        return this.storeOutcome(
          tx,
          organizationId,
          userId,
          deviceId,
          operation,
          'rejected',
          { rejectionCode: 'UNSUPPORTED_OPERATION' },
        );

      const membership = await tx.membership.findUniqueOrThrow({
        where: { organizationId_userId: { organizationId, userId } },
      });
      if (
        !hasCapability(
          membership.role,
          membership.isExternal,
          Capability.AssetsManage,
        )
      )
        return this.storeOutcome(
          tx,
          organizationId,
          userId,
          deviceId,
          operation,
          'rejected',
          { rejectionCode: 'FORBIDDEN' },
        );

      const payload = plainToInstance(CreateAssetDto, operation.payload);
      const errors = await validate(payload, { whitelist: true });
      if (errors.length)
        return this.storeOutcome(
          tx,
          organizationId,
          userId,
          deviceId,
          operation,
          'rejected',
          { rejectionCode: 'VALIDATION_FAILED' },
        );

      const existingAsset = await tx.asset.findFirst({
        where: { id: operation.entityId, organizationId },
      });
      if (existingAsset)
        return this.storeOutcome(
          tx,
          organizationId,
          userId,
          deviceId,
          operation,
          'already_applied',
        );

      try {
        await this.assets.createInTransaction(
          tx,
          organizationId,
          userId,
          payload,
          operation.entityId,
        );
      } catch {
        return this.storeOutcome(
          tx,
          organizationId,
          userId,
          deviceId,
          operation,
          'rejected',
          { rejectionCode: 'ENTITY_NOT_FOUND' },
        );
      }
      return this.storeOutcome(
        tx,
        organizationId,
        userId,
        deviceId,
        operation,
        'applied',
      );
    }
    if (operation.entityType === 'work_order' && !workOrder)
      return this.storeOutcome(
        tx,
        organizationId,
        userId,
        deviceId,
        operation,
        'rejected',
        {
          rejectionCode: 'ENTITY_NOT_FOUND',
        },
      );
    if (operation.entityType === 'inspection' && !inspection)
      return this.storeOutcome(
        tx,
        organizationId,
        userId,
        deviceId,
        operation,
        'rejected',
        { rejectionCode: 'ENTITY_NOT_FOUND' },
      );

    let outcome = syncOutcome(
      operation.operationType,
      operation.baseVersion,
      workOrder?.version ?? inspection?.version ?? null,
      operation.payload,
      (workOrder?.completionRules as Record<string, unknown>) ?? {},
    );
    if (
      outcome !== 'conflict' &&
      operation.operationType === 'status_transition' &&
      workOrder
    ) {
      try {
        assertWorkOrderTransition(
          workOrder.status,
          operation.payload.status as WorkOrderStatus,
        );
      } catch {
        return this.storeOutcome(
          tx,
          organizationId,
          userId,
          deviceId,
          operation,
          'rejected',
          {
            rejectionCode: 'INVALID_TRANSITION',
          },
        );
      }
      await tx.workOrder.update({
        where: { id: workOrder.id },
        data: {
          status: operation.payload.status as string,
          version: { increment: 1 },
        },
      });
      outcome = 'applied';
    }
    if (outcome === 'conflict') {
      const conflict = await tx.syncConflict.create({
        data: {
          id: newId(),
          organizationId,
          deviceId,
          entityType: operation.entityType,
          entityId: operation.entityId,
          operationType: operation.operationType,
          localValue: operation.payload as Prisma.InputJsonValue,
          serverValue: (workOrder ?? inspection ?? {}) as Prisma.InputJsonValue,
        },
      });
      const result = await this.storeOutcome(
        tx,
        organizationId,
        userId,
        deviceId,
        operation,
        outcome,
        {
          conflictId: conflict.id,
        },
      );
      return { ...result, serverValue: workOrder ?? inspection ?? {} };
    }
    if (inspection && operation.operationType === 'update')
      await tx.inspection.update({
        where: { id: inspection.id },
        data: {
          draftAnswers: operation.payload.answers as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });
    if (inspection && operation.operationType === 'form_submission_create') {
      const answers = operation.payload.answers;
      const outcomeValue = operation.payload.outcome;
      if (
        !answers ||
        typeof answers !== 'object' ||
        Array.isArray(answers) ||
        ![
          'passed',
          'passed_with_observations',
          'failed',
          'incomplete',
          'not_applicable',
        ].includes(String(outcomeValue)) ||
        operation.payload.formVersionId !== inspection.formVersionId ||
        !['draft', 'rejected', 'clarification_requested'].includes(
          inspection.status,
        )
      )
        return this.storeOutcome(
          tx,
          organizationId,
          userId,
          deviceId,
          operation,
          'rejected',
          { rejectionCode: 'INVALID_SUBMISSION' },
        );
      const formVersion = await tx.formVersion.findUniqueOrThrow({
        where: { id: inspection.formVersionId },
      });
      const evaluation = evaluateForm(
        formVersion.schema as FormSchema,
        answers as Record<string, unknown>,
      );
      if (!evaluation.valid)
        return this.storeOutcome(
          tx,
          organizationId,
          userId,
          deviceId,
          operation,
          'rejected',
          { rejectionCode: 'FORM_VALIDATION_FAILED' },
        );
      for (const [fieldId, rule] of Object.entries(evaluation.evidence)) {
        const ids = evaluation.answers[`${fieldId}_evidence`];
        if (
          !Array.isArray(ids) ||
          (await tx.mediaObject.count({
            where: {
              id: {
                in: ids.filter((id): id is string => typeof id === 'string'),
              },
              organizationId,
              status: 'ready',
              links: {
                some: { entityType: 'inspection', entityId: inspection.id },
              },
            },
          })) < rule!.minimum
        )
          return this.storeOutcome(
            tx,
            organizationId,
            userId,
            deviceId,
            operation,
            'rejected',
            { rejectionCode: 'EVIDENCE_REQUIRED' },
          );
      }
      const revision =
        (await tx.formSubmission.count({
          where: { inspectionId: inspection.id },
        })) + 1;
      await tx.formSubmission.create({
        data: {
          id: newId(),
          organizationId,
          inspectionId: inspection.id,
          formVersionId: inspection.formVersionId,
          revision,
          answers: evaluation.answers as Prisma.InputJsonValue,
          outcome: String(outcomeValue),
          submittedBy: userId,
        },
      });
      await tx.inspection.update({
        where: { id: inspection.id },
        data: {
          status: 'submitted',
          draftAnswers: evaluation.answers as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });
      outcome = 'applied';
    }
    const projectId =
      workOrder?.projectId ??
      inspection?.projectId ??
      this.payloadUuid(operation.payload.projectId);
    await tx.entityChangeLog.create({
      data: {
        organizationId,
        projectId,
        entityType: operation.entityType,
        entityId: operation.entityId,
        operationType: operation.operationType,
        version:
          workOrder || inspection
            ? (workOrder?.version ?? inspection!.version) + 1
            : (operation.baseVersion ?? 0) + 1,
        payload: operation.payload as Prisma.InputJsonValue,
      },
    });
    return this.storeOutcome(
      tx,
      organizationId,
      userId,
      deviceId,
      operation,
      outcome,
    );
  }

  private async storeOutcome(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    deviceId: string,
    operation: SyncOperationDto,
    status:
      'applied' | 'auto_merged' | 'conflict' | 'rejected' | 'already_applied',
    extra: { rejectionCode?: string; conflictId?: string } = {},
  ) {
    await tx.syncOperation.create({
      data: {
        id: newId(),
        organizationId,
        deviceId,
        clientOperationId: operation.operationId,
        entityType: operation.entityType,
        entityId: operation.entityId,
        operationType: operation.operationType,
        baseVersion: operation.baseVersion,
        payload: operation.payload as Prisma.InputJsonValue,
        status,
        ...extra,
        clientCreatedAt: new Date(operation.clientCreatedAt),
        appliedAt:
          status === 'applied' || status === 'auto_merged'
            ? new Date()
            : undefined,
      },
    });
    await this.audit.write(tx, {
      organizationId,
      actorId: userId,
      action: `sync.operation_${status}`,
      resourceType: 'sync_operation',
      resourceId: operation.operationId,
      summary: {
        entityType: operation.entityType,
        entityId: operation.entityId,
        ...extra,
      },
    });
    return { operationId: operation.operationId, status, ...extra };
  }

  private async authorizedDevice(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    deviceId: string,
  ) {
    const device = await tx.syncDevice.findFirst({
      where: { id: deviceId, organizationId, userId },
    });
    if (!device || device.revokedAt)
      throw new ForbiddenException('Device is not authorized');
    if (device.packageExpiresAt <= new Date())
      throw new ForbiddenException('Offline package has expired');
    return device;
  }

  private async assertCoordinator(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
  ) {
    const membership = await tx.membership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!['owner', 'admin', 'manager', 'coordinator'].includes(membership.role))
      throw new ForbiddenException('Conflict resolution denied');
  }

  private payloadUuid(value: unknown) {
    return typeof value === 'string' && validateUuid(value) ? value : undefined;
  }
}
