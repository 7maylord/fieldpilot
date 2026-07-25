import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { createToken, hashToken } from '../auth/token';
import { newId } from '../common/id';
import { PrismaService } from '../database/prisma.service';
import { TenantDatabase } from '../database/tenant-database.service';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantDatabase,
    private readonly audit: AuditService,
  ) {}

  create(userId: string, name: string, slug: string) {
    const organizationId = newId();
    return this.tenants.withTenant({ organizationId, userId }, async (tx) => {
      const organization = await tx.organization.create({
        data: {
          id: organizationId,
          name: name.trim(),
          slug,
          createdBy: userId,
        },
      });
      await tx.membership.create({
        data: { id: newId(), organizationId, userId, role: 'owner' },
      });
      await this.audit.write(tx, {
        organizationId,
        actorId: userId,
        action: 'organization.created',
        resourceType: 'organization',
        resourceId: organizationId,
        summary: { name: organization.name, slug: organization.slug },
      });
      await this.audit.enqueue(tx, {
        organizationId,
        eventType: 'organization.created',
        aggregateId: organizationId,
        payload: { organizationId },
      });
      return organization;
    });
  }

  async list(userId: string) {
    const rows = await this.prisma.$queryRaw<{ organization_id: string }[]>`
      SELECT organization_id FROM app_user_organizations(${userId}::uuid)
    `;
    return Promise.all(
      rows.map(({ organization_id: organizationId }) =>
        this.tenants.withMembership({ organizationId, userId }, (tx) =>
          tx.organization.findUniqueOrThrow({ where: { id: organizationId } }),
        ),
      ),
    );
  }

  listMembers(organizationId: string, userId: string) {
    return this.tenants.withMembership({ organizationId, userId }, (tx) =>
      tx.membership.findMany({
        where: { organizationId },
        select: {
          id: true,
          userId: true,
          role: true,
          status: true,
          isExternal: true,
          createdAt: true,
          user: { select: { email: true } },
        },
      }),
    );
  }

  listAudit(organizationId: string, userId: string) {
    return this.tenants.withMembership({ organizationId, userId }, (tx) =>
      tx.auditEvent.findMany({
        where: { organizationId },
        orderBy: { occurredAt: 'desc' },
        take: 100,
      }),
    );
  }

  listTeams(organizationId: string, userId: string) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        const teams = await tx.team.findMany({
          where: { organizationId },
          orderBy: { name: 'asc' },
        });
        const memberships = await tx.teamMembership.findMany({
          where: { organizationId },
        });
        const users = await tx.user.findMany({
          where: { id: { in: memberships.map((member) => member.userId) } },
          select: { id: true, email: true },
        });
        const usersById = new Map(users.map((user) => [user.id, user]));
        return teams.map((team) => ({
          ...team,
          members: memberships
            .filter((member) => member.teamId === team.id)
            .map((member) => ({
              ...member,
              user: usersById.get(member.userId),
            })),
        }));
      },
    );
  }

  invite(
    organizationId: string,
    actorId: string,
    emailInput: string,
    role: string,
  ) {
    const email = emailInput.trim().toLowerCase();
    const raw = createToken();
    const token = `${organizationId}.${raw}`;
    return this.tenants.withMembership(
      { organizationId, userId: actorId },
      async (tx) => {
        const invitation = await tx.invitation.create({
          data: {
            id: newId(),
            organizationId,
            email,
            role,
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            createdBy: actorId,
          },
        });
        await this.audit.write(tx, {
          organizationId,
          actorId,
          action: 'membership.invited',
          resourceType: 'invitation',
          resourceId: invitation.id,
          summary: { email, role },
        });
        await this.audit.enqueue(tx, {
          organizationId,
          eventType: 'membership.invited',
          aggregateId: invitation.id,
          payload: { email, role, token },
        });
        return { invitationId: invitation.id, expiresAt: invitation.expiresAt };
      },
    );
  }

  async acceptInvitation(userId: string, userEmail: string, token: string) {
    const organizationId = token.split('.', 1)[0];
    if (!organizationId || !/^[0-9a-f-]{36}$/i.test(organizationId))
      throw new NotFoundException('Invitation not found');
    return this.tenants.withTenant({ organizationId, userId }, async (tx) => {
      const invitation = await tx.invitation.findUnique({
        where: { tokenHash: hashToken(token) },
      });
      if (
        !invitation ||
        invitation.acceptedAt ||
        invitation.expiresAt <= new Date()
      ) {
        throw new NotFoundException('Invitation not found');
      }
      if (invitation.email !== userEmail.toLowerCase())
        throw new ConflictException('Invitation email does not match');
      const membership = await tx.membership.upsert({
        where: { organizationId_userId: { organizationId, userId } },
        create: {
          id: newId(),
          organizationId,
          userId,
          role: invitation.role,
          isExternal: invitation.role === 'external',
        },
        update: {
          status: 'active',
          role: invitation.role,
          isExternal: invitation.role === 'external',
        },
      });
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
      await this.audit.write(tx, {
        organizationId,
        actorId: userId,
        action: 'membership.accepted',
        resourceType: 'membership',
        resourceId: membership.id,
      });
      return membership;
    });
  }

  updateMembership(
    organizationId: string,
    actorId: string,
    membershipId: string,
    role: string,
    isExternal?: boolean,
  ) {
    return this.tenants.withMembership(
      { organizationId, userId: actorId },
      async (tx) => {
        const current = await tx.membership.findUniqueOrThrow({
          where: { id: membershipId },
        });
        if (current.role === 'owner' && role !== 'owner') {
          const owners = await tx.membership.count({
            where: { organizationId, role: 'owner', status: 'active' },
          });
          if (owners === 1)
            throw new ConflictException('Organization must retain an owner');
        }
        const membership = await tx.membership.update({
          where: { id: membershipId },
          data: { role, isExternal: isExternal ?? role === 'external' },
        });
        await this.audit.write(tx, {
          organizationId,
          actorId,
          action: 'membership.updated',
          resourceType: 'membership',
          resourceId: membership.id,
          summary: { beforeRole: current.role, afterRole: membership.role },
        });
        return membership;
      },
    );
  }

  createTeam(organizationId: string, actorId: string, name: string) {
    return this.tenants.withMembership(
      { organizationId, userId: actorId },
      async (tx) => {
        const team = await tx.team.create({
          data: { id: newId(), organizationId, name: name.trim() },
        });
        await this.audit.write(tx, {
          organizationId,
          actorId,
          action: 'team.created',
          resourceType: 'team',
          resourceId: team.id,
          summary: { name: team.name },
        });
        return team;
      },
    );
  }

  addTeamMember(
    organizationId: string,
    actorId: string,
    teamId: string,
    userId: string,
  ) {
    return this.tenants.withMembership(
      { organizationId, userId: actorId },
      async (tx) => {
        await tx.membership.findUniqueOrThrow({
          where: { organizationId_userId: { organizationId, userId } },
        });
        return tx.teamMembership.create({
          data: { id: newId(), organizationId, teamId, userId },
        });
      },
    );
  }

  grantProjectAccess(
    organizationId: string,
    actorId: string,
    projectId: string,
    userId: string,
  ) {
    return this.tenants.withMembership(
      { organizationId, userId: actorId },
      (tx) =>
        tx.projectAccess.upsert({
          where: { projectId_userId: { projectId, userId } },
          create: { id: newId(), organizationId, projectId, userId },
          update: {},
        }),
    );
  }
}
