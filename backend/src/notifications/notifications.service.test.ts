import { describe, expect, it, vi } from 'vitest';
import type { TenantDatabase } from '../database/tenant-database.service';
import { NotificationsService } from './notifications.service';

function serviceWith(tx: object) {
  const tenants = {
    withTenant: vi.fn(
      (_context: unknown, operation: (value: object) => unknown) =>
        operation(tx),
    ),
  };
  return new NotificationsService(tenants as unknown as TenantDatabase);
}

describe('NotificationsService', () => {
  it('broadcasts operational events to active leaders', async () => {
    const tx = {
      membership: {
        findMany: vi.fn().mockResolvedValue([{ userId: 'user-1' }]),
      },
      notification: { upsert: vi.fn() },
    };
    const service = serviceWith(tx);

    await service.deliver(
      'site.created',
      {
        organizationId: '019f9fe8-faca-7322-9333-88bc8ef9e0fe',
        siteId: '019f9fe8-faca-7b3d-a080-ce902a3dd8f4',
      },
      '019f9fe8-faca-7da6-a285-ddcdf2651b99',
    );

    expect(tx.membership.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: '019f9fe8-faca-7322-9333-88bc8ef9e0fe',
        status: 'active',
        role: { in: ['owner', 'admin', 'manager', 'coordinator'] },
      },
      select: { userId: true },
    });
    expect(tx.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: 'user-1',
          kind: 'site.created',
          title: 'Site opened',
          resourceType: 'site',
          resourceId: '019f9fe8-faca-7b3d-a080-ce902a3dd8f4',
        }),
      }),
    );
  });
});
