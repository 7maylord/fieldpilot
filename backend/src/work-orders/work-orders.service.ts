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
  CreateWorkOrderDto,
  TransitionWorkOrderDto,
} from './dto';
import { assertWorkOrderTransition } from './work-order-state';

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
            : await tx.team.findFirst({
                where: { id: input.assigneeId, organizationId },
              });
        if (!assigneeExists)
          throw new BadRequestException(
            'Assignee does not belong to the organization',
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
        return assignment;
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
