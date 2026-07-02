import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiApp } from '../../src/bootstrap/api-app';
import { loadConfig } from '../../src/config/app.config';
import { PrismaService } from '../../src/database/prisma.service';
import { TenantDatabase } from '../../src/database/tenant-database.service';
import { QueueService } from '../../src/queue/queue.service';
import { OutboxPublisher } from '../../src/queue/outbox-publisher.service';
import { createToken, hashToken } from '../../src/auth/token';
import request from 'supertest';

const prisma = new PrismaService();
const tenants = new TenantDatabase(prisma);

describe('platform integration', () => {
  let app: Awaited<ReturnType<typeof createApiApp>>;

  beforeAll(async () => {
    app = await createApiApp(loadConfig({ NODE_ENV: 'test' }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('forces tenant isolation for Prisma and raw SQL', async () => {
    const userId = uuidv7();
    const organizationA = uuidv7();
    const organizationB = uuidv7();
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@example.test`,
        passwordHash: 'not-used',
      },
    });
    await tenants.withTenant(
      { organizationId: organizationA, userId },
      async (tx) => {
        await tx.organization.create({
          data: {
            id: organizationA,
            name: 'A',
            slug: `a-${organizationA}`,
            createdBy: userId,
          },
        });
      },
    );
    await tenants.withTenant(
      { organizationId: organizationB, userId },
      async (tx) => {
        await tx.organization.create({
          data: {
            id: organizationB,
            name: 'B',
            slug: `b-${organizationB}`,
            createdBy: userId,
          },
        });
      },
    );
    const projectId = uuidv7();
    await tenants.withTenant({ organizationId: organizationA, userId }, (tx) =>
      tx.project.create({
        data: {
          id: projectId,
          organizationId: organizationA,
          code: 'RLS-TEST',
          name: 'Tenant A project',
          timezone: 'Africa/Lagos',
        },
      }),
    );
    const siteId = uuidv7();
    const locationId = uuidv7();
    await tenants.withTenant(
      { organizationId: organizationA, userId },
      async (tx) => {
        await tx.site.create({
          data: {
            id: siteId,
            organizationId: organizationA,
            projectId,
            name: 'Bridge',
            code: 'BR-01',
          },
        });
        await tx.$executeRaw`
          INSERT INTO locations (id, organization_id, project_id, site_id, name, location_type, geometry)
          VALUES (${locationId}::uuid, ${organizationA}::uuid, ${projectId}::uuid, ${siteId}::uuid, 'Pier 1', 'gps_point', ST_SetSRID(ST_MakePoint(3.4, 6.5), 4326))
        `;
      },
    );
    const firstWorkOrderId = uuidv7();
    const secondWorkOrderId = uuidv7();
    await tenants.withTenant(
      { organizationId: organizationA, userId },
      async (tx) => {
        await tx.workOrder.createMany({
          data: [
            {
              id: firstWorkOrderId,
              organizationId: organizationA,
              projectId,
              siteId,
              locationId,
              title: 'Inspect pier',
              workType: 'inspection',
              priority: 'high',
              createdBy: userId,
            },
            {
              id: secondWorkOrderId,
              organizationId: organizationA,
              projectId,
              siteId,
              title: 'Repair pier',
              workType: 'repair',
              priority: 'medium',
              createdBy: userId,
            },
          ],
        });
        await tx.workOrderDependency.create({
          data: {
            id: uuidv7(),
            organizationId: organizationA,
            workOrderId: secondWorkOrderId,
            prerequisiteWorkOrderId: firstWorkOrderId,
          },
        });
      },
    );

    expect(await prisma.organization.count()).toBe(0);
    expect(await prisma.project.count()).toBe(0);
    expect(await prisma.site.count()).toBe(0);
    expect(await prisma.location.count()).toBe(0);
    expect(await prisma.workOrder.count()).toBe(0);
    expect(await prisma.workOrderDependency.count()).toBe(0);
    expect(
      await tenants.withTenant(
        { organizationId: organizationB, userId },
        (tx) => tx.project.findUnique({ where: { id: projectId } }),
      ),
    ).toBeNull();
    const visible = await tenants.withTenant(
      { organizationId: organizationA, userId },
      (tx) =>
        tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM organizations ORDER BY id`,
    );
    expect(visible.map(({ id }) => id)).toEqual([organizationA]);
    const policies = await prisma.$queryRaw<
      {
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }[]
    >`
      SELECT relname, relrowsecurity, relforcerowsecurity
      FROM pg_class
      WHERE relname IN (
        'organizations', 'organization_memberships', 'organization_invitations', 'teams',
        'team_memberships', 'project_access', 'audit_events', 'outbox_events', 'job_executions',
        'projects', 'sites', 'locations', 'work_orders', 'work_order_assignments',
        'work_order_dependencies'
      )
    `;
    expect(policies).toHaveLength(15);
    expect(
      policies.every(
        (policy) => policy.relrowsecurity && policy.relforcerowsecurity,
      ),
    ).toBe(true);
    await expect(
      tenants.withTenant({ organizationId: organizationA, userId }, (tx) =>
        tx.organization.create({
          data: {
            id: uuidv7(),
            name: 'Wrong tenant',
            slug: `wrong-${uuidv7()}`,
            createdBy: userId,
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('registers, verifies, logs in, creates a tenant, and enforces capabilities', async () => {
    const agent = request.agent(app.getHttpServer());
    const email = `${uuidv7()}@example.test`;
    const csrf = await agent.get('/api/v1/auth/csrf').expect(200);
    const csrfToken = csrf.body.csrfToken as string;
    const registration = await agent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrfToken)
      .send({ email, password: 'correct-horse-battery-staple' })
      .expect(201);

    const event = await prisma.identityOutboxEvent.findFirstOrThrow({
      where: {
        userId: registration.body.userId as string,
        eventType: 'identity.email_verification_requested',
      },
    });
    const verificationToken = (event.payload as { verificationToken: string })
      .verificationToken;
    await agent
      .post('/api/v1/auth/verify-email')
      .set('x-csrf-token', csrfToken)
      .send({ token: verificationToken })
      .expect(201);
    await agent
      .post('/api/v1/auth/login')
      .set('x-csrf-token', csrfToken)
      .send({ email, password: 'correct-horse-battery-staple' })
      .expect(201);
    await agent
      .post('/api/v1/auth/refresh')
      .set('x-csrf-token', csrfToken)
      .expect(201);
    await agent
      .get('/api/v1/auth/me')
      .expect(200, { id: registration.body.userId as string, email });

    const created = await agent
      .post('/api/v1/organizations')
      .set('x-csrf-token', csrfToken)
      .send({ name: 'Bridge Team', slug: `bridge-${uuidv7()}` })
      .expect(201);
    await agent.get('/api/v1/organizations').expect(200);
    const team = await agent
      .post(`/api/v1/organizations/${created.body.id as string}/teams`)
      .set('x-csrf-token', csrfToken)
      .send({ name: 'Inspectors' })
      .expect(201);
    const organizationId = created.body.id as string;
    const project = await agent
      .post(`/api/v1/organizations/${organizationId}/projects`)
      .set('x-csrf-token', csrfToken)
      .send({
        name: 'Bridge Rehabilitation',
        code: 'BRIDGE-01',
        timezone: 'Africa/Lagos',
      })
      .expect(201);
    await agent
      .get(`/api/v1/organizations/${organizationId}/projects`)
      .expect(200);
    const site = await agent
      .post(
        `/api/v1/organizations/${organizationId}/projects/${project.body.id as string}/sites`,
      )
      .set('x-csrf-token', csrfToken)
      .send({ name: 'Main Bridge', code: 'SITE-01' })
      .expect(201);
    const location = await agent
      .post(
        `/api/v1/organizations/${organizationId}/projects/${project.body.id as string}/sites/${site.body.id as string}/locations`,
      )
      .set('x-csrf-token', csrfToken)
      .send({
        name: 'Pier One',
        locationType: 'gps_point',
        latitude: 6.5,
        longitude: 3.4,
      })
      .expect(201);
    expect(location.body.geometry).toContain('Point');
    await agent
      .get(
        `/api/v1/organizations/${organizationId}/projects/${project.body.id as string}/locations/viewport`,
      )
      .query({ west: 3, south: 6, east: 4, north: 7 })
      .expect(200)
      .expect(({ body }) => expect(body).toHaveLength(1));

    const prerequisite = await agent
      .post(`/api/v1/organizations/${organizationId}/work-orders`)
      .set('x-csrf-token', csrfToken)
      .send({
        projectId: project.body.id,
        siteId: site.body.id,
        locationId: location.body.id,
        title: 'Inspect pier',
        workType: 'inspection',
        priority: 'high',
        evidenceRequirements: ['photo'],
      })
      .expect(201);
    const workOrder = await agent
      .post(`/api/v1/organizations/${organizationId}/work-orders`)
      .set('x-csrf-token', csrfToken)
      .send({
        projectId: project.body.id,
        siteId: site.body.id,
        title: 'Repair pier',
        workType: 'repair',
        priority: 'medium',
        evidenceRequirements: ['photo', 'signature'],
      })
      .expect(201);
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/work-orders/${workOrder.body.id as string}/assignments`,
      )
      .set('x-csrf-token', csrfToken)
      .send({ version: 1, assigneeType: 'team', assigneeId: team.body.id })
      .expect(201);
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/work-orders/${workOrder.body.id as string}/dependencies`,
      )
      .set('x-csrf-token', csrfToken)
      .send({ version: 2, prerequisiteWorkOrderId: prerequisite.body.id })
      .expect(201);
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/work-orders/${workOrder.body.id as string}/transitions`,
      )
      .set('x-csrf-token', csrfToken)
      .send({ version: 3, status: 'scheduled' })
      .expect(201);
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/work-orders/${workOrder.body.id as string}/transitions`,
      )
      .set('x-csrf-token', csrfToken)
      .send({ version: 3, status: 'assigned' })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('RESOURCE_CONFLICT'));
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/work-orders/${workOrder.body.id as string}/transitions`,
      )
      .set('x-csrf-token', csrfToken)
      .send({ version: 4, status: 'assigned' })
      .expect(201);

    const viewerId = uuidv7();
    const viewerToken = createToken();
    const viewerCsrf = createToken();
    await prisma.user.create({
      data: {
        id: viewerId,
        email: `${viewerId}@example.test`,
        passwordHash: 'not-used',
      },
    });
    await prisma.session.create({
      data: {
        id: uuidv7(),
        userId: viewerId,
        tokenHash: hashToken(viewerToken),
        refreshTokenHash: hashToken(createToken()),
        expiresAt: new Date(Date.now() + 60_000),
        refreshExpiresAt: new Date(Date.now() + 120_000),
      },
    });
    await tenants.withTenant(
      { organizationId, userId: registration.body.userId as string },
      (tx) =>
        tx.membership.create({
          data: {
            id: uuidv7(),
            organizationId,
            userId: viewerId,
            role: 'viewer',
          },
        }),
    );
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/projects`)
      .set('Cookie', [
        `fieldpilot_session=${viewerToken}`,
        `fieldpilot_csrf=${viewerCsrf}`,
      ])
      .set('x-csrf-token', viewerCsrf)
      .send({ name: 'Forbidden', code: 'NO-ACCESS', timezone: 'UTC' })
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe('AUTHORIZATION_DENIED'));
    const history = await tenants.withTenant(
      {
        organizationId,
        userId: registration.body.userId as string,
      },
      async (tx) => ({
        audit: await tx.auditEvent.findFirstOrThrow(),
        actions: (
          await tx.auditEvent.findMany({ select: { action: true } })
        ).map(({ action }) => action),
        outbox: await tx.outboxEvent.count(),
        eventTypes: (
          await tx.outboxEvent.findMany({ select: { eventType: true } })
        ).map(({ eventType }) => eventType),
      }),
    );
    expect(history.audit.id).toBeTruthy();
    expect(history.actions).toEqual(
      expect.arrayContaining([
        'project.created',
        'site.created',
        'location.created',
        'work_order.created',
        'work_order.assigned',
        'work_order.dependency_added',
        'work_order.transitioned',
      ]),
    );
    expect(history.eventTypes).toEqual(
      expect.arrayContaining([
        'project.created',
        'work_order.created',
        'work_order.transitioned',
      ]),
    );
    expect(history.outbox).toBeGreaterThan(0);
    await expect(
      tenants.withTenant(
        {
          organizationId,
          userId: registration.body.userId as string,
        },
        (tx) =>
          tx.auditEvent.update({
            where: { id: history.audit.id },
            data: { action: 'tampered' },
          }),
      ),
    ).rejects.toThrow();
    await app.get(OutboxPublisher).publishBatch();
    const unpublished = await tenants.withTenant(
      {
        organizationId,
        userId: registration.body.userId as string,
      },
      (tx) => tx.outboxEvent.count({ where: { publishedAt: null } }),
    );
    expect(unpublished).toBe(0);
  });

  it('reports readiness and deduplicates queued jobs', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(200, { status: 'ready' });
    const queues = app.get(QueueService);
    const jobId = `integration-${uuidv7()}`;
    const first = await queues.add(
      'notifications',
      'test',
      { organizationId: uuidv7() },
      jobId,
    );
    const duplicate = await queues.add(
      'notifications',
      'test',
      { organizationId: uuidv7() },
      jobId,
    );
    expect(duplicate.id).toBe(first.id);
    expect((await queues.metrics()).notifications.waiting).toBeGreaterThan(0);
  });

  it('returns request IDs and RFC 7807 errors', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/does-not-exist')
      .expect(404);
    expect(response.headers['x-request-id']).toBeTruthy();
    expect(response.type).toBe('application/problem+json');
    expect(response.body.code).toBe('RESOURCE_NOT_FOUND');
  });
});
