import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service';
import type { TenantDatabase } from '../database/tenant-database.service';
import { SitesService } from './sites.service';

function serviceWith(tx: object) {
  const tenants = {
    withMembership: vi.fn(
      (_context: unknown, operation: (value: object) => unknown) =>
        operation(tx),
    ),
  };
  return new SitesService(
    tenants as unknown as TenantDatabase,
    { write: vi.fn() } as unknown as AuditService,
  );
}

describe('SitesService', () => {
  it('rejects inverted viewport bounds before querying PostGIS', () => {
    const service = serviceWith({});
    expect(() =>
      service.viewport('org', 'user', 'project', {
        west: 10,
        east: 5,
        south: 0,
        north: 1,
        limit: 200,
      }),
    ).toThrow(BadRequestException);
  });

  it('requires explicit project access for external members', async () => {
    const tx = {
      membership: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ isExternal: true }),
      },
      project: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    await expect(
      serviceWith(tx).listSites('org', 'external', 'project'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects coordinates unless latitude and longitude arrive together', async () => {
    const service = serviceWith({});
    expect(() =>
      service.createLocation('org', 'user', 'project', 'site', {
        name: 'Point',
        locationType: 'gps_point',
        latitude: 4,
      }),
    ).toThrow(BadRequestException);
  });
});
