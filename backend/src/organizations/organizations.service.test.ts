import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../database/prisma.service';
import type { TenantDatabase } from '../database/tenant-database.service';
import { OrganizationsService } from './organizations.service';

function serviceWith(tx: object) {
  const audit = { write: vi.fn() };
  const tenants = {
    withMembership: vi.fn(
      (_context: unknown, operation: (value: object) => unknown) =>
        operation(tx),
    ),
  };
  return {
    audit,
    service: new OrganizationsService(
      {} as PrismaService,
      tenants as unknown as TenantDatabase,
      audit as unknown as AuditService,
    ),
  };
}

describe('OrganizationsService', () => {
  it('lists organizations with the signed-in membership role', async () => {
    const tx = {
      organization: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'org-1',
          name: 'TEC Engineering',
          slug: 'tec',
        }),
      },
      membership: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          role: 'admin',
          status: 'active',
          isExternal: false,
        }),
      },
    };
    const tenants = {
      withMembership: vi.fn(
        (_context: unknown, operation: (value: object) => unknown) =>
          operation(tx),
      ),
    };
    const service = new OrganizationsService(
      {
        $queryRaw: vi.fn().mockResolvedValue([{ organization_id: 'org-1' }]),
      } as unknown as PrismaService,
      tenants as unknown as TenantDatabase,
      { write: vi.fn() } as unknown as AuditService,
    );

    await expect(service.list('user-1')).resolves.toEqual([
      {
        id: 'org-1',
        name: 'TEC Engineering',
        slug: 'tec',
        membership: { role: 'admin', status: 'active', isExternal: false },
      },
    ]);
  });

  it('lists only the signed-in member teams', async () => {
    const tx = {
      teamMembership: {
        findMany: vi.fn().mockResolvedValue([{ teamId: 'team-1' }]),
      },
      team: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: 'team-1', name: 'Drillers' }]),
      },
    };
    const { service } = serviceWith(tx);

    await expect(service.listMyTeams('org-1', 'user-1')).resolves.toEqual([
      { id: 'team-1', name: 'Drillers' },
    ]);
    expect(tx.teamMembership.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', userId: 'user-1' },
      select: { teamId: true },
    });
    expect(tx.team.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', id: { in: ['team-1'] } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  });

  it('revokes membership and removes scoped access leftovers', async () => {
    const tx = {
      membership: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'membership-1',
          organizationId: 'org-1',
          userId: 'user-1',
          role: 'member',
          status: 'active',
        }),
        update: vi.fn().mockResolvedValue({
          id: 'membership-1',
          userId: 'user-1',
          role: 'member',
          status: 'revoked',
        }),
      },
      teamMembership: { deleteMany: vi.fn() },
      projectAccess: { deleteMany: vi.fn() },
    };
    const { audit, service } = serviceWith(tx);

    await expect(
      service.revokeMembership('org-1', 'actor-1', 'membership-1'),
    ).resolves.toMatchObject({ status: 'revoked' });

    expect(tx.teamMembership.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', userId: 'user-1' },
    });
    expect(tx.projectAccess.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', userId: 'user-1' },
    });
    expect(tx.membership.update).toHaveBeenCalledWith({
      where: { id: 'membership-1' },
      data: { status: 'revoked' },
    });
    expect(audit.write).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'membership.revoked' }),
    );
  });

  it('does not revoke the last active owner', async () => {
    const tx = {
      membership: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'membership-1',
          organizationId: 'org-1',
          userId: 'owner-1',
          role: 'owner',
          status: 'active',
        }),
        count: vi.fn().mockResolvedValue(1),
      },
      teamMembership: { deleteMany: vi.fn() },
      projectAccess: { deleteMany: vi.fn() },
    };
    const { service } = serviceWith(tx);

    await expect(
      service.revokeMembership('org-1', 'actor-1', 'membership-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.teamMembership.deleteMany).not.toHaveBeenCalled();
  });
});
