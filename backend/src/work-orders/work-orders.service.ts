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
import type {
  AddDependencyDto,
  AssignWorkOrderDto,
  CheckScheduleDto,
  CreateWorkOrderDto,
  TransitionWorkOrderDto,
  UpsertScheduleResourceDto,
} from './dto';
import { assertWorkOrderTransition } from './work-order-state';
import {
  findScheduleConflicts,
  type ScheduleWindow,
} from './scheduling-conflicts';

@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly tenants: TenantDatabase,
    private readonly audit: AuditService,
  ) {}

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

  create(organizationId: string, actorId: string, input: CreateWorkOrderDto) {
    if (
      input.plannedStart &&
      input.plannedEnd &&
      input.plannedEnd < input.plannedStart
    )
      throw new BadRequestException(
        'Planned end must not precede planned start',
      );
    return this.tenants.withMembership(
      { organizationId, userId: actorId },
      async (tx) => {
        await this.assertProjectAccess(
          tx,
          organizationId,
          actorId,
          input.projectId,
        );
        if (
          input.siteId &&
          !(await tx.site.findFirst({
            where: {
              id: input.siteId,
              organizationId,
              projectId: input.projectId,
            },
          }))
        )
          throw new BadRequestException('Site must belong to the project');
        if (
          input.locationId &&
          !(await tx.location.findFirst({
            where: {
              id: input.locationId,
              organizationId,
              projectId: input.projectId,
              siteId: input.siteId,
            },
          }))
        )
          throw new BadRequestException(
            'Location must belong to the selected site',
          );
        const workOrder = await tx.workOrder.create({
          data: {
            id: newId(),
            organizationId,
            projectId: input.projectId,
            siteId: input.siteId,
            locationId: input.locationId,
            title: input.title.trim(),
            description: input.description,
            workType: input.workType,
            priority: input.priority,
            plannedStart: input.plannedStart
              ? new Date(input.plannedStart)
              : undefined,
            plannedEnd: input.plannedEnd
              ? new Date(input.plannedEnd)
              : undefined,
            dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
            estimatedMinutes: input.estimatedMinutes,
            requiredSkills: input.requiredSkills,
            evidenceRequirements: input.evidenceRequirements,
            completionRules: input.completionRules as Prisma.InputJsonValue,
            checklistId: input.checklistId,
            createdBy: actorId,
          },
        });
        await this.record(
          tx,
          organizationId,
          actorId,
          workOrder.id,
          'work_order.created',
          { projectId: input.projectId },
        );
        return workOrder;
      },
    );
  }

  list(organizationId: string, userId: string, projectId: string) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        await this.assertProjectAccess(tx, organizationId, userId, projectId);
        return tx.workOrder.findMany({
          where: { organizationId, projectId },
          include: { assignments: true, prerequisites: true },
          orderBy: { updatedAt: 'desc' },
        });
      },
    );
  }

  dispatch(organizationId: string, userId: string, projectId: string) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        await this.assertProjectAccess(tx, organizationId, userId, projectId);
        const [workOrders, resources] = await Promise.all([
          tx.workOrder.findMany({
            where: { organizationId, projectId, archivedAt: null },
            include: { assignments: true },
            orderBy: [{ plannedStart: 'asc' }, { priority: 'desc' }],
          }),
          tx.scheduleResource.findMany({
            where: {
              organizationId,
              OR: [
                { projectIds: { isEmpty: true } },
                { projectIds: { has: projectId } },
              ],
            },
            orderBy: [{ resourceType: 'asc' }, { name: 'asc' }],
          }),
        ]);
        const unassigned = workOrders.filter(
          ({ assignments }) => !assignments.length,
        );
        // ponytail: sequential ranking is enough for the MVP; batch if dispatch volumes prove otherwise.
        const recommendations = [];
        for (const workOrder of unassigned.filter(
          ({ plannedStart, plannedEnd }) => plannedStart && plannedEnd,
        )) {
          for (const resource of resources) {
            const conflicts = await this.checkScheduleInTransaction(
              tx,
              organizationId,
              workOrder.id,
              {
                assigneeType: resource.resourceType as
                  'user' | 'team' | 'equipment',
                assigneeId: resource.resourceId,
              },
            );
            recommendations.push({
              workOrderId: workOrder.id,
              resourceId: resource.resourceId,
              resourceType: resource.resourceType,
              resourceName: resource.name,
              conflicts,
              score:
                100 -
                conflicts.filter(({ severity }) => severity === 'error')
                  .length *
                  50 -
                conflicts.filter(({ severity }) => severity === 'warning')
                  .length *
                  10,
            });
          }
        }
        recommendations.sort((left, right) => right.score - left.score);
        return { workOrders, resources, unassigned, recommendations };
      },
    );
  }

  upsertScheduleResource(
    organizationId: string,
    actorId: string,
    input: UpsertScheduleResourceDto,
  ) {
    const windows = [...input.shifts, ...input.blackouts];
    if (windows.some((window) => window.endsAt <= window.startsAt))
      throw new BadRequestException(
        'Schedule windows must have a positive duration',
      );
    const shifts = input.shifts as unknown as Prisma.InputJsonValue;
    const blackouts = input.blackouts as unknown as Prisma.InputJsonValue;
    return this.tenants.withMembership(
      { organizationId, userId: actorId },
      async (tx) => {
        if (input.resourceType === 'user')
          await tx.membership.findUniqueOrThrow({
            where: {
              organizationId_userId: {
                organizationId,
                userId: input.resourceId,
              },
            },
          });
        if (
          input.resourceType === 'team' &&
          !(await tx.team.findFirst({
            where: { id: input.resourceId, organizationId },
          }))
        )
          throw new BadRequestException(
            'Team does not belong to the organization',
          );
        return tx.scheduleResource.upsert({
          where: {
            organizationId_resourceType_resourceId: {
              organizationId,
              resourceType: input.resourceType,
              resourceId: input.resourceId,
            },
          },
          create: {
            id: newId(),
            organizationId,
            resourceType: input.resourceType,
            resourceId: input.resourceId,
            name: input.name.trim(),
            skills: input.skills,
            projectIds: input.projectIds,
            shifts,
            blackouts,
            travelSpeedKph: input.travelSpeedKph,
          },
          update: {
            name: input.name.trim(),
            skills: input.skills,
            projectIds: input.projectIds,
            shifts,
            blackouts,
            travelSpeedKph: input.travelSpeedKph,
          },
        });
      },
    );
  }

  checkSchedule(
    organizationId: string,
    actorId: string,
    workOrderId: string,
    input: CheckScheduleDto,
  ) {
    return this.tenants.withMembership(
      { organizationId, userId: actorId },
      async (tx) => {
        const workOrder = await tx.workOrder.findFirst({
          where: { id: workOrderId, organizationId },
        });
        if (!workOrder) throw new NotFoundException('Work order not found');
        await this.assertProjectAccess(
          tx,
          organizationId,
          actorId,
          workOrder.projectId,
        );
        return this.checkScheduleInTransaction(
          tx,
          organizationId,
          workOrderId,
          input,
        );
      },
    );
  }

  assign(
    organizationId: string,
    actorId: string,
    workOrderId: string,
    input: AssignWorkOrderDto,
  ) {
    return this.tenants.withMembership(
      { organizationId, userId: actorId },
      async (tx) => {
        const workOrder = await tx.workOrder.findFirst({
          where: { id: workOrderId, organizationId },
        });
        if (!workOrder) throw new NotFoundException('Work order not found');
        await this.assertProjectAccess(
          tx,
          organizationId,
          actorId,
          workOrder.projectId,
        );
        const assigneeExists =
          input.assigneeType === 'user'
            ? await tx.membership.findUnique({
                where: {
                  organizationId_userId: {
                    organizationId,
                    userId: input.assigneeId,
                  },
                },
              })
            : input.assigneeType === 'team'
              ? await tx.team.findFirst({
                  where: { id: input.assigneeId, organizationId },
                })
              : await tx.scheduleResource.findUnique({
                  where: {
                    organizationId_resourceType_resourceId: {
                      organizationId,
                      resourceType: 'equipment',
                      resourceId: input.assigneeId,
                    },
                  },
                });
        if (!assigneeExists)
          throw new BadRequestException(
            'Assignee does not belong to the organization',
          );
        const conflicts = await this.checkScheduleInTransaction(
          tx,
          organizationId,
          workOrderId,
          input,
        );
        const errors = conflicts.filter(({ severity }) => severity === 'error');
        if (errors.length)
          throw new BadRequestException(
            `Scheduling conflicts: ${errors.map(({ code }) => code).join(', ')}`,
          );
        await this.bumpVersion(tx, organizationId, workOrderId, input.version);
        const assignment = await tx.workOrderAssignment.create({
          data: {
            id: newId(),
            organizationId,
            workOrderId,
            assigneeType: input.assigneeType,
            assigneeId: input.assigneeId,
            createdBy: actorId,
          },
        });
        await this.record(
          tx,
          organizationId,
          actorId,
          workOrderId,
          'work_order.assigned',
          { assigneeType: input.assigneeType, assigneeId: input.assigneeId },
        );
        return {
          ...assignment,
          warnings: conflicts.filter(({ severity }) => severity === 'warning'),
        };
      },
    );
  }

  addDependency(
    organizationId: string,
    actorId: string,
    workOrderId: string,
    input: AddDependencyDto,
  ) {
    if (workOrderId === input.prerequisiteWorkOrderId)
      throw new BadRequestException('A work order cannot depend on itself');
    return this.tenants.withMembership(
      { organizationId, userId: actorId },
      async (tx) => {
        const [workOrder, prerequisite] = await Promise.all([
          tx.workOrder.findFirst({
            where: { id: workOrderId, organizationId },
          }),
          tx.workOrder.findFirst({
            where: { id: input.prerequisiteWorkOrderId, organizationId },
          }),
        ]);
        if (
          !workOrder ||
          !prerequisite ||
          workOrder.projectId !== prerequisite.projectId
        )
          throw new BadRequestException(
            'Dependencies must belong to the same project',
          );
        await this.assertProjectAccess(
          tx,
          organizationId,
          actorId,
          workOrder.projectId,
        );
        const cycle = await tx.$queryRaw<{ found: number }[]>`
        WITH RECURSIVE prerequisites(id) AS (
          SELECT prerequisite_work_order_id FROM work_order_dependencies WHERE work_order_id = ${input.prerequisiteWorkOrderId}::uuid
          UNION SELECT d.prerequisite_work_order_id FROM work_order_dependencies d JOIN prerequisites p ON d.work_order_id = p.id
        ) SELECT 1 AS found FROM prerequisites WHERE id = ${workOrderId}::uuid LIMIT 1
      `;
        if (cycle.length)
          throw new ConflictException('Dependency would create a cycle');
        await this.bumpVersion(tx, organizationId, workOrderId, input.version);
        const dependency = await tx.workOrderDependency.create({
          data: {
            id: newId(),
            organizationId,
            workOrderId,
            prerequisiteWorkOrderId: input.prerequisiteWorkOrderId,
          },
        });
        await this.record(
          tx,
          organizationId,
          actorId,
          workOrderId,
          'work_order.dependency_added',
          { prerequisiteWorkOrderId: input.prerequisiteWorkOrderId },
        );
        return dependency;
      },
    );
  }

  transition(
    organizationId: string,
    actorId: string,
    workOrderId: string,
    input: TransitionWorkOrderDto,
  ) {
    return this.tenants.withMembership(
      { organizationId, userId: actorId },
      async (tx) => {
        const current = await tx.workOrder.findFirst({
          where: { id: workOrderId, organizationId },
        });
        if (!current) throw new NotFoundException('Work order not found');
        await this.assertProjectAccess(
          tx,
          organizationId,
          actorId,
          current.projectId,
        );
        assertWorkOrderTransition(current.status, input.status);
        if (
          input.status === 'assigned' &&
          !(await tx.workOrderAssignment.count({ where: { workOrderId } }))
        )
          throw new BadRequestException('An assignment is required');
        if (input.status === 'completed') {
          const incomplete = await tx.workOrderDependency.count({
            where: {
              workOrderId,
              prerequisite: { status: { not: 'completed' } },
            },
          });
          if (incomplete)
            throw new BadRequestException(
              'Prerequisite work orders are incomplete',
            );
        }
        const result = await tx.workOrder.updateMany({
          where: {
            id: workOrderId,
            organizationId,
            version: input.version,
            status: current.status,
          },
          data: { status: input.status, version: { increment: 1 } },
        });
        if (!result.count)
          throw new ConflictException('Work-order version is stale');
        await this.record(
          tx,
          organizationId,
          actorId,
          workOrderId,
          'work_order.transitioned',
          { from: current.status, to: input.status },
        );
        return tx.workOrder.findUniqueOrThrow({ where: { id: workOrderId } });
      },
    );
  }

  private async bumpVersion(
    tx: Prisma.TransactionClient,
    organizationId: string,
    workOrderId: string,
    version: number,
  ) {
    const result = await tx.workOrder.updateMany({
      where: { id: workOrderId, organizationId, version },
      data: { version: { increment: 1 } },
    });
    if (!result.count)
      throw new ConflictException('Work-order version is stale');
  }

  private async checkScheduleInTransaction(
    tx: Prisma.TransactionClient,
    organizationId: string,
    workOrderId: string,
    input: CheckScheduleDto,
  ) {
    const workOrder = await tx.workOrder.findUniqueOrThrow({
      where: { id: workOrderId },
      include: { prerequisites: { include: { prerequisite: true } } },
    });
    if (!workOrder.plannedStart || !workOrder.plannedEnd)
      throw new BadRequestException('Work order requires a planned schedule');
    const profile = await tx.scheduleResource.findUnique({
      where: {
        organizationId_resourceType_resourceId: {
          organizationId,
          resourceType: input.assigneeType,
          resourceId: input.assigneeId,
        },
      },
    });
    if (!profile)
      throw new BadRequestException('Schedule resource profile is missing');
    let projectIds = profile.projectIds.length ? profile.projectIds : undefined;
    if (input.assigneeType === 'user') {
      const membership = await tx.membership.findUnique({
        where: {
          organizationId_userId: { organizationId, userId: input.assigneeId },
        },
      });
      if (!membership || membership.status !== 'active')
        throw new BadRequestException('Worker membership is inactive');
      if (membership.isExternal)
        projectIds = (
          await tx.projectAccess.findMany({
            where: { organizationId, userId: input.assigneeId },
            select: { projectId: true },
          })
        ).map(({ projectId }) => projectId);
    }
    const assignments = await tx.workOrderAssignment.findMany({
      where: {
        organizationId,
        assigneeType: input.assigneeType,
        assigneeId: input.assigneeId,
        workOrderId: { not: workOrderId },
        workOrder: { plannedStart: { not: null }, plannedEnd: { not: null } },
      },
      include: { workOrder: true },
    });
    const locationIds = [
      workOrder.locationId,
      ...assignments.map(({ workOrder }) => workOrder.locationId),
    ].filter((id): id is string => Boolean(id));
    const coordinates = locationIds.length
      ? await tx.$queryRaw<
          { id: string; latitude: number; longitude: number }[]
        >`
          SELECT id, ST_Y(geometry)::float AS latitude, ST_X(geometry)::float AS longitude
          FROM locations WHERE organization_id = ${organizationId}::uuid AND id = ANY(${locationIds}::uuid[])
        `
      : [];
    const point = new Map(
      coordinates.map((coordinate) => [coordinate.id, coordinate]),
    );
    const toWindow = (value: unknown): ScheduleWindow[] =>
      Array.isArray(value)
        ? value.map((window) => ({
            startsAt: new Date(
              String((window as { startsAt: unknown }).startsAt),
            ),
            endsAt: new Date(String((window as { endsAt: unknown }).endsAt)),
          }))
        : [];
    return findScheduleConflicts(
      {
        startsAt: workOrder.plannedStart,
        endsAt: workOrder.plannedEnd,
        ...point.get(workOrder.locationId ?? ''),
        projectId: workOrder.projectId,
        requiredSkills: workOrder.requiredSkills,
        prerequisiteStatuses: workOrder.prerequisites.map(
          ({ prerequisite }) => prerequisite.status,
        ),
      },
      {
        type: input.assigneeType,
        skills: profile.skills,
        projectIds,
        shifts: toWindow(profile.shifts),
        blackouts: toWindow(profile.blackouts),
        travelSpeedKph: profile.travelSpeedKph,
        assignments: assignments.map(({ workOrder: assigned }) => ({
          startsAt: assigned.plannedStart!,
          endsAt: assigned.plannedEnd!,
          ...point.get(assigned.locationId ?? ''),
        })),
      },
    );
  }

  private async record(
    tx: Prisma.TransactionClient,
    organizationId: string,
    actorId: string,
    workOrderId: string,
    action: string,
    summary: Prisma.InputJsonValue,
  ) {
    await this.audit.write(tx, {
      organizationId,
      actorId,
      action,
      resourceType: 'work_order',
      resourceId: workOrderId,
      summary,
    });
    await this.audit.enqueue(tx, {
      organizationId,
      eventType: action,
      aggregateId: workOrderId,
      payload: { workOrderId, ...(summary as object) },
    });
  }
}
