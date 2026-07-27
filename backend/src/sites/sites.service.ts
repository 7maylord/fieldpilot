import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { newId } from '../common/id';
import { TenantDatabase } from '../database/tenant-database.service';
import type { CreateLocationDto, CreateSiteDto, ViewportQueryDto } from './dto';

type LocationRow = {
  id: string;
  organizationId: string;
  projectId: string;
  siteId: string;
  parentId: string | null;
  name: string;
  locationType: string;
  status: string;
  geometry: string | null;
  version: number;
};

@Injectable()
export class SitesService {
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

  listSites(organizationId: string, userId: string, projectId: string) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        await this.assertProjectAccess(tx, organizationId, userId, projectId);
        return tx.site.findMany({
          where: { organizationId, projectId },
          orderBy: { name: 'asc' },
        });
      },
    );
  }

  createSite(
    organizationId: string,
    actorId: string,
    projectId: string,
    input: CreateSiteDto,
  ) {
    return this.tenants.withMembership(
      { organizationId, userId: actorId },
      async (tx) => {
        await this.assertProjectAccess(tx, organizationId, actorId, projectId);
        const site = await tx.site.create({
          data: {
            id: newId(),
            organizationId,
            projectId,
            name: input.name.trim(),
            code: input.code,
          },
        });
        await this.audit.write(tx, {
          organizationId,
          actorId,
          action: 'site.created',
          resourceType: 'site',
          resourceId: site.id,
          summary: { projectId, code: site.code },
        });
        await this.audit.enqueue(tx, {
          organizationId,
          eventType: 'site.created',
          aggregateId: site.id,
          payload: { siteId: site.id, projectId, code: site.code },
        });
        return site;
      },
    );
  }

  listLocations(
    organizationId: string,
    userId: string,
    projectId: string,
    siteId: string,
  ) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        await this.assertProjectAccess(tx, organizationId, userId, projectId);
        return tx.$queryRaw<LocationRow[]>`
        SELECT id, organization_id AS "organizationId", project_id AS "projectId", site_id AS "siteId",
          parent_id AS "parentId", name, location_type AS "locationType", status,
          ST_AsGeoJSON(geometry) AS geometry, version
        FROM locations WHERE organization_id = ${organizationId}::uuid AND project_id = ${projectId}::uuid
          AND site_id = ${siteId}::uuid ORDER BY name
      `;
      },
    );
  }

  createLocation(
    organizationId: string,
    actorId: string,
    projectId: string,
    siteId: string,
    input: CreateLocationDto,
  ) {
    if ((input.latitude === undefined) !== (input.longitude === undefined))
      throw new BadRequestException(
        'Latitude and longitude must be provided together',
      );
    if (
      input.chainageStart !== undefined &&
      input.chainageEnd !== undefined &&
      input.chainageEnd < input.chainageStart
    )
      throw new BadRequestException('Chainage end must not precede start');
    return this.tenants.withMembership(
      { organizationId, userId: actorId },
      async (tx) => {
        await this.assertProjectAccess(tx, organizationId, actorId, projectId);
        const site = await tx.site.findFirst({
          where: { id: siteId, organizationId, projectId },
        });
        if (!site) throw new NotFoundException('Site not found');
        if (input.parentId) {
          const parent = await tx.location.findFirst({
            where: { id: input.parentId, organizationId, projectId, siteId },
          });
          if (!parent)
            throw new BadRequestException(
              'Parent location must belong to the same site',
            );
        }
        const id = newId();
        const [location] = await tx.$queryRaw<LocationRow[]>`
        INSERT INTO locations (id, organization_id, project_id, site_id, parent_id, name, location_type, geometry, chainage_start, chainage_end)
        VALUES (${id}::uuid, ${organizationId}::uuid, ${projectId}::uuid, ${siteId}::uuid, ${input.parentId ?? null}::uuid,
          ${input.name.trim()}, ${input.locationType},
          CASE WHEN ${input.longitude ?? null}::double precision IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(${input.longitude ?? null}, ${input.latitude ?? null}), 4326) END,
          ${input.chainageStart ?? null}, ${input.chainageEnd ?? null})
        RETURNING id, organization_id AS "organizationId", project_id AS "projectId", site_id AS "siteId", parent_id AS "parentId",
          name, location_type AS "locationType", status, ST_AsGeoJSON(geometry) AS geometry, version
      `;
        if (!location) throw new Error('Location insert failed');
        await this.audit.write(tx, {
          organizationId,
          actorId,
          action: 'location.created',
          resourceType: 'location',
          resourceId: id,
          summary: { projectId, siteId, parentId: input.parentId },
        });
        return location;
      },
    );
  }

  viewport(
    organizationId: string,
    userId: string,
    projectId: string,
    query: ViewportQueryDto,
  ) {
    if (query.west >= query.east || query.south >= query.north)
      throw new BadRequestException('Viewport bounds are invalid');
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        await this.assertProjectAccess(tx, organizationId, userId, projectId);
        return tx.$queryRaw<LocationRow[]>`
        SELECT id, organization_id AS "organizationId", project_id AS "projectId", site_id AS "siteId", parent_id AS "parentId",
          name, location_type AS "locationType", status, ST_AsGeoJSON(geometry) AS geometry, version
        FROM locations WHERE organization_id = ${organizationId}::uuid AND project_id = ${projectId}::uuid
          AND geometry && ST_MakeEnvelope(${query.west}, ${query.south}, ${query.east}, ${query.north}, 4326)
        ORDER BY id LIMIT ${query.limit}
      `;
      },
    );
  }
}
