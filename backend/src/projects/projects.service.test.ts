import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service';
import type { TenantDatabase } from '../database/tenant-database.service';
import { ProjectsService } from './projects.service';

function serviceWith(tx: object) {
  const tenants = {
    withMembership: vi.fn((_context, operation: (value: object) => unknown) =>
      operation(tx),
    ),
  };
  const audit = { write: vi.fn(), enqueue: vi.fn() };
  return {
    service: new ProjectsService(
      tenants as unknown as TenantDatabase,
      audit as unknown as AuditService,
    ),
    tenants,
    audit,
  };
}

describe('ProjectsService', () => {
  it('rejects invalid timezones before persistence because project dates depend on them', () => {
    const { service, tenants } = serviceWith({});
    expect(() =>
      service.create('org', 'user', {
        name: 'Bridge',
        code: 'BR-01',
        timezone: 'Not/AZone',
      }),
    ).toThrow(BadRequestException);
    expect(tenants.withMembership).not.toHaveBeenCalled();
  });

  it('limits external project lists to explicit access grants', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const tx = {
      membership: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ isExternal: true }),
      },
      project: { findMany },
    };
    const { service } = serviceWith(tx);
    await service.list('org', 'external-user');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org',
          access: { some: { userId: 'external-user' } },
        },
      }),
    );
  });

  it('rejects stale archive requests instead of overwriting a newer version', async () => {
    const tx = {
      project: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    const { service } = serviceWith(tx);
    await expect(
      service.archive('org', 'user', 'project', 1),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
