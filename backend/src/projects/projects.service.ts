import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { newId } from '../common/id';
import { TenantDatabase } from '../database/tenant-database.service';
import type { CreateProjectDto, UpdateProjectDto } from './dto';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly tenants: TenantDatabase,
    private readonly audit: AuditService,
  ) {}

  private validateTimezone(timezone: string) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
    } catch {
      throw new BadRequestException('Invalid IANA timezone');
    }
  }

  private dates(startDate?: string, endDate?: string) {
    if (startDate && endDate && endDate < startDate)
      throw new BadRequestException('End date must not precede start date');
    return {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    };
  }

  create(organizationId: string, actorId: string, input: CreateProjectDto) {
    this.validateTimezone(input.timezone);
    return this.tenants.withMembership(
      { organizationId, userId: actorId },
      async (tx) => {
        const project = await tx.project.create({
          data: {
            id: newId(),
            organizationId,
            code: input.code,
            name: input.name.trim(),
            timezone: input.timezone,
            description: input.description,
            client: input.client,
            address: input.address,
            ...this.dates(input.startDate, input.endDate),
          },
        });
        await this.audit.write(tx, {
          organizationId,
          actorId,
          action: 'project.created',
          resourceType: 'project',
          resourceId: project.id,
          summary: { code: project.code, name: project.name },
        });
        await this.audit.enqueue(tx, {
          organizationId,
          eventType: 'project.created',
          aggregateId: project.id,
          payload: { projectId: project.id },
        });
        return project;
      },
    );
  }

  list(organizationId: string, userId: string) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        const membership = await tx.membership.findUniqueOrThrow({
          where: { organizationId_userId: { organizationId, userId } },
        });
        return tx.project.findMany({
          where: {
            organizationId,
            ...(membership.isExternal ? { access: { some: { userId } } } : {}),
          },
          orderBy: { updatedAt: 'desc' },
        });
      },
    );
  }

  get(organizationId: string, userId: string, projectId: string) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
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
        if (!project) throw new NotFoundException('Project not found');
        return project;
      },
    );
  }

  update(
    organizationId: string,
    actorId: string,
    projectId: string,
    input: UpdateProjectDto,
  ) {
    if (input.timezone) this.validateTimezone(input.timezone);
    if (input.status === 'archived')
      throw new BadRequestException('Use the archive endpoint');
    return this.tenants.withMembership(
      { organizationId, userId: actorId },
      async (tx) => {
        const result = await tx.project.updateMany({
          where: {
            id: projectId,
            organizationId,
            version: input.version,
            status: { not: 'archived' },
          },
          data: {
            name: input.name?.trim(),
            status: input.status,
            timezone: input.timezone,
            description: input.description,
            client: input.client,
            address: input.address,
            ...this.dates(input.startDate, input.endDate),
            version: { increment: 1 },
          },
        });
        if (!result.count)
          throw new ConflictException(
            'Project version is stale or project is archived',
          );
        const project = await tx.project.findUniqueOrThrow({
          where: { id: projectId },
        });
        await this.audit.write(tx, {
          organizationId,
          actorId,
          action: 'project.updated',
          resourceType: 'project',
          resourceId: project.id,
          summary: { version: project.version, status: project.status },
        });
        return project;
      },
    );
  }

  archive(
    organizationId: string,
    actorId: string,
    projectId: string,
    version: number,
  ) {
    return this.tenants.withMembership(
      { organizationId, userId: actorId },
      async (tx) => {
        const archivedAt = new Date();
        const result = await tx.project.updateMany({
          where: {
            id: projectId,
            organizationId,
            version,
            status: { not: 'archived' },
          },
          data: { status: 'archived', archivedAt, version: { increment: 1 } },
        });
        if (!result.count)
          throw new ConflictException(
            'Project version is stale or project is archived',
          );
        const project = await tx.project.findUniqueOrThrow({
          where: { id: projectId },
        });
        await this.audit.write(tx, {
          organizationId,
          actorId,
          action: 'project.archived',
          resourceType: 'project',
          resourceId: project.id,
        });
        await this.audit.enqueue(tx, {
          organizationId,
          eventType: 'project.archived',
          aggregateId: project.id,
          payload: { projectId: project.id },
        });
        return project;
      },
    );
  }
}
