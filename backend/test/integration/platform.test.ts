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
        await tx.syncDevice.create({
          data: {
            id: uuidv7(),
            organizationId: organizationA,
            userId,
            name: 'RLS device',
            platform: 'web',
            appVersion: '1.0.0',
            packageExpiresAt: new Date(Date.now() + 60_000),
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
    expect(await prisma.syncDevice.count()).toBe(0);
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
        'work_order_dependencies', 'sync_devices', 'sync_operations', 'sync_conflicts',
        'sync_checkpoints', 'entity_change_log'
      )
    `;
    expect(policies).toHaveLength(20);
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
    const deviceId = uuidv7();
    const device = await agent
      .post(`/api/v1/organizations/${organizationId}/devices`)
      .set('x-csrf-token', csrfToken)
      .send({
        deviceId,
        name: 'Site tablet',
        platform: 'web',
        appVersion: '1.0.0',
      })
      .expect(201);
    expect(new Date(device.body.packageExpiresAt).getTime()).toBeGreaterThan(
      Date.now(),
    );
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/devices/${deviceId}/heartbeat`,
      )
      .set('x-csrf-token', csrfToken)
      .send({ appVersion: '1.1.0' })
      .expect(201)
      .expect(({ body }) => expect(body.appVersion).toBe('1.1.0'));
    await tenants.withTenant(
      { organizationId, userId: registration.body.userId as string },
      (tx) =>
        tx.syncDevice.update({
          where: { id: deviceId },
          data: { packageExpiresAt: new Date(Date.now() - 1_000) },
        }),
    );
    await agent
      .get(`/api/v1/organizations/${organizationId}/devices/${deviceId}/status`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.purgeReason).toBe('package_expired');
        expect(body.localAction).toBe('quarantine_unsynced_then_purge');
      });
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/devices/${deviceId}/package`,
      )
      .set('x-csrf-token', csrfToken)
      .expect(409);
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/devices/${deviceId}/purge/acknowledge`,
      )
      .set('x-csrf-token', csrfToken)
      .expect(201);
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/devices/${deviceId}/package`,
      )
      .set('x-csrf-token', csrfToken)
      .expect(201)
      .expect(({ body }) => expect(body.purgeRequestedAt).toBeNull());
    await agent
      .post(`/api/v1/organizations/${organizationId}/devices/${deviceId}/purge`)
      .set('x-csrf-token', csrfToken)
      .expect(201);
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/devices/${deviceId}/purge/acknowledge`,
      )
      .set('x-csrf-token', csrfToken)
      .expect(201)
      .expect(({ body }) => expect(body.purgeAcknowledgedAt).toBeTruthy());
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/devices/${deviceId}/revoke`,
      )
      .set('x-csrf-token', csrfToken)
      .expect(201);
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/devices/${deviceId}/heartbeat`,
      )
      .set('x-csrf-token', csrfToken)
      .send({ appVersion: '1.2.0' })
      .expect(403);
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

    const syncDeviceId = uuidv7();
    await agent
      .post(`/api/v1/organizations/${organizationId}/devices`)
      .set('x-csrf-token', csrfToken)
      .send({
        deviceId: syncDeviceId,
        name: 'Offline tablet',
        platform: 'web',
        appVersion: '1.0.0',
      })
      .expect(201);
    const bootstrap = await agent
      .post('/api/v1/sync/bootstrap')
      .set('x-csrf-token', csrfToken)
      .send({
        deviceId: syncDeviceId,
        organizationId,
        projectIds: [project.body.id],
        lastCheckpoint: null,
      })
      .expect(201);
    expect(bootstrap.body.checkpoint).toBeTruthy();
    expect(bootstrap.body.projects).toHaveLength(1);
    expect(bootstrap.body.workOrders).toHaveLength(2);
    const transitionOperationId = uuidv7();
    const rejectedOperationId = uuidv7();
    const push = await agent
      .post('/api/v1/sync/push')
      .set('x-csrf-token', csrfToken)
      .set('idempotency-key', uuidv7())
      .send({
        organizationId,
        deviceId: syncDeviceId,
        operations: [
          {
            operationId: transitionOperationId,
            entityType: 'work_order',
            entityId: workOrder.body.id,
            operationType: 'status_transition',
            baseVersion: 5,
            clientCreatedAt: new Date().toISOString(),
            payload: { status: 'accepted' },
          },
          {
            operationId: rejectedOperationId,
            entityType: 'work_order',
            entityId: workOrder.body.id,
            operationType: 'unknown_operation',
            baseVersion: 5,
            clientCreatedAt: new Date().toISOString(),
            payload: {},
          },
          {
            operationId: uuidv7(),
            entityType: 'comment',
            entityId: uuidv7(),
            operationType: 'comment_append',
            baseVersion: null,
            clientCreatedAt: new Date().toISOString(),
            payload: { projectId: project.body.id, body: 'Field note' },
          },
        ],
      })
      .expect(201);
    expect(push.body.results[0].status).toBe('applied');
    expect(push.body.results[1].status).toBe('rejected');
    expect(push.body.results[2].status).toBe('auto_merged');
    await agent
      .post('/api/v1/sync/push')
      .set('x-csrf-token', csrfToken)
      .set('idempotency-key', uuidv7())
      .send({
        organizationId,
        deviceId: syncDeviceId,
        operations: [
          {
            operationId: transitionOperationId,
            entityType: 'work_order',
            entityId: workOrder.body.id,
            operationType: 'status_transition',
            baseVersion: 5,
            clientCreatedAt: new Date().toISOString(),
            payload: { status: 'accepted' },
          },
        ],
      })
      .expect(201)
      .expect(({ body }) =>
        expect(body.results[0].status).toBe('already_applied'),
      );
    const conflictPush = await agent
      .post('/api/v1/sync/push')
      .set('x-csrf-token', csrfToken)
      .set('idempotency-key', uuidv7())
      .send({
        organizationId,
        deviceId: syncDeviceId,
        operations: [
          {
            operationId: uuidv7(),
            entityType: 'work_order',
            entityId: workOrder.body.id,
            operationType: 'update',
            baseVersion: 1,
            clientCreatedAt: new Date(0).toISOString(),
            payload: { title: 'Offline title' },
          },
        ],
      })
      .expect(201);
    expect(conflictPush.body.results[0].status).toBe('conflict');
    const preservedClock = await tenants.withTenant(
      { organizationId, userId: registration.body.userId as string },
      (tx) =>
        tx.syncOperation.findUniqueOrThrow({
          where: {
            organizationId_deviceId_clientOperationId: {
              organizationId,
              deviceId: syncDeviceId,
              clientOperationId: conflictPush.body.results[0]
                .operationId as string,
            },
          },
        }),
    );
    expect(preservedClock.clientCreatedAt.toISOString()).toBe(
      new Date(0).toISOString(),
    );
    const pulled = await agent
      .post('/api/v1/sync/pull')
      .set('x-csrf-token', csrfToken)
      .send({
        organizationId,
        deviceId: syncDeviceId,
        checkpoint: bootstrap.body.checkpoint,
        limit: 1,
      })
      .expect(201);
    expect(pulled.body.changes).toHaveLength(1);
    expect(pulled.body.hasMore).toBe(true);
    const conflicts = await agent
      .get('/api/v1/sync/conflicts')
      .query({ organizationId })
      .expect(200);
    expect(conflicts.body).toHaveLength(1);
    await agent
      .post(`/api/v1/sync/conflicts/${conflicts.body[0].id as string}/resolve`)
      .set('x-csrf-token', csrfToken)
      .send({ organizationId, resolution: { choice: 'local' } })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('resolved'));
    await agent
      .get(`/api/v1/organizations/${organizationId}/work-orders`)
      .query({ projectId: project.body.id })
      .expect(200)
      .expect(({ body }) =>
        expect(
          body.find(({ id }: { id: string }) => id === workOrder.body.id).title,
        ).toBe('Offline title'),
      );
    await agent
      .post('/api/v1/sync/pull')
      .set('x-csrf-token', csrfToken)
      .send({
        organizationId,
        deviceId: syncDeviceId,
        checkpoint: pulled.body.nextCheckpoint,
        limit: 10,
      })
      .expect(201)
      .expect(({ body }) =>
        expect(
          body.changes.some(
            ({ operationType }: { operationType: string }) =>
              operationType === 'conflict_resolution',
          ),
        ).toBe(true),
      );
    await agent
      .post('/api/v1/sync/bootstrap')
      .set('x-csrf-token', csrfToken)
      .send({
        deviceId: syncDeviceId,
        organizationId,
        projectIds: [project.body.id],
        lastCheckpoint: uuidv7(),
      })
      .expect(409);

    const secondSyncDeviceId = uuidv7();
    await agent
      .post(`/api/v1/organizations/${organizationId}/devices`)
      .set('x-csrf-token', csrfToken)
      .send({
        deviceId: secondSyncDeviceId,
        name: 'Second offline tablet',
        platform: 'web',
        appVersion: '1.0.0',
      })
      .expect(201);
    const secondBootstrap = await agent
      .post('/api/v1/sync/bootstrap')
      .set('x-csrf-token', csrfToken)
      .send({
        organizationId,
        deviceId: secondSyncDeviceId,
        projectIds: [project.body.id],
        lastCheckpoint: null,
      })
      .expect(201);
    expect(secondBootstrap.body.checkpoint).not.toBe(bootstrap.body.checkpoint);
    await tenants.withTenant(
      { organizationId, userId: registration.body.userId as string },
      (tx) =>
        tx.syncDevice.update({
          where: { id: secondSyncDeviceId },
          data: { packageExpiresAt: new Date(0) },
        }),
    );
    await agent
      .post('/api/v1/sync/pull')
      .set('x-csrf-token', csrfToken)
      .send({
        organizationId,
        deviceId: secondSyncDeviceId,
        checkpoint: secondBootstrap.body.checkpoint,
      })
      .expect(403);
    await agent
      .post('/api/v1/sync/push')
      .set('x-csrf-token', csrfToken)
      .set('idempotency-key', uuidv7())
      .send({
        organizationId,
        deviceId,
        operations: [
          {
            operationId: uuidv7(),
            entityType: 'work_order',
            entityId: workOrder.body.id,
            operationType: 'update',
            baseVersion: 1,
            clientCreatedAt: new Date().toISOString(),
            payload: {},
          },
        ],
      })
      .expect(403);

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
        'sync.bootstrap_created',
        'sync.operation_applied',
        'sync.operation_auto_merged',
        'sync.operation_conflict',
        'sync.operation_rejected',
        'sync.conflict_resolved',
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
