import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiApp } from '../../src/bootstrap/api-app';
import { loadConfig } from '../../src/config/app.config';
import { DefectsService } from '../../src/defects/defects.service';
import { TenantDatabase } from '../../src/database/tenant-database.service';

describe('defect creation with a caller-supplied id', () => {
  let app: Awaited<ReturnType<typeof createApiApp>>;

  beforeAll(async () => {
    app = await createApiApp(loadConfig({ NODE_ENV: 'test' }));
    await app.init();
  });

  afterAll(async () => app.close());

  it('persists the id the caller provides', async () => {
    const defects = app.get(DefectsService);
    const tenants = app.get(TenantDatabase);
    const { organizationId, userId, projectId } = await seedProject(app);
    const id = randomUUID();

    const created = await tenants.withMembership(
      { organizationId, userId },
      (tx) =>
        defects.createInTransaction(tx, organizationId, userId, {
          projectId,
          category: 'quality',
          severity: 'high',
          title: 'Spalling at pier 4',
        }, id),
    );

    expect(created.id).toBe(id);
    expect(created.status).toBe('reported');
  });
});

describe('defect_create via sync push', () => {
  let app: Awaited<ReturnType<typeof createApiApp>>;
  let tenants: TenantDatabase;

  beforeAll(async () => {
    app = await createApiApp(loadConfig({ NODE_ENV: 'test' }));
    await app.init();
    tenants = app.get(TenantDatabase);
  });

  afterAll(async () => app.close());

  // `defects` and `organization_memberships` are protected by FORCE ROW LEVEL
  // SECURITY (see prisma/migrations/20260629000100_platform_foundation and
  // 20260704000300_defects), scoped to `app.organization_id`. The bare
  // `prisma` client below never sets that session var, so it can't see rows
  // it didn't insert itself — direct verification reads/writes against those
  // tables go through `tenants.withTenant`, same as the app code does.
  const defectCount = (organizationId: string, userId: string, id?: string) =>
    tenants.withTenant({ organizationId, userId }, (tx) =>
      tx.defect.count({ where: id ? { id } : { organizationId } }),
    );

  it('creates the defect row and reports applied', async () => {
    const { organizationId, userId, projectId, deviceId, push } =
      await seedProject(app);
    const entityId = randomUUID();
    const operationId = randomUUID();

    const response = await push({
      organizationId,
      deviceId,
      operations: [
        {
          operationId,
          entityType: 'defect',
          entityId,
          operationType: 'defect_create',
          baseVersion: null,
          clientCreatedAt: new Date().toISOString(),
          payload: {
            projectId,
            category: 'safety',
            severity: 'critical',
            title: 'Scaffold plank loose at bay 3',
          },
        },
      ],
    });

    expect(response.results[0].status).toBe('applied');
    const row = await tenants.withTenant({ organizationId, userId }, (tx) =>
      tx.defect.findUnique({ where: { id: entityId } }),
    );
    expect(row).not.toBeNull();
    expect(row?.createdBy).toBe(userId);
  });

  it('is idempotent on replay', async () => {
    const { organizationId, userId, projectId, deviceId, push } =
      await seedProject(app);
    const entityId = randomUUID();
    const operationId = randomUUID();
    const operation = {
      operationId,
      entityType: 'defect',
      entityId,
      operationType: 'defect_create',
      baseVersion: null,
      clientCreatedAt: new Date().toISOString(),
      payload: {
        projectId,
        category: 'quality',
        severity: 'low',
        title: 'Replayed defect',
      },
    };

    const first = await push({ organizationId, deviceId, operations: [operation] });
    const second = await push({ organizationId, deviceId, operations: [operation] });

    expect(first.results[0].status).toBe('applied');
    expect(second.results[0].status).toBe('already_applied');
    expect(await defectCount(organizationId, userId, entityId)).toBe(1);
  });

  it('rejects a defect operation type other than defect_create', async () => {
    const { organizationId, userId, projectId, deviceId, push } =
      await seedProject(app);
    const entityId = randomUUID();

    const response = await push({
      organizationId,
      deviceId,
      operations: [
        {
          operationId: randomUUID(),
          entityType: 'defect',
          entityId,
          operationType: 'status_transition',
          baseVersion: 1,
          clientCreatedAt: new Date().toISOString(),
          payload: { projectId, status: 'triaged' },
        },
      ],
    });

    expect(response.results[0].status).toBe('rejected');
    expect(response.results[0].rejectionCode).toBe('UNSUPPORTED_OPERATION');
    expect(await defectCount(organizationId, userId, entityId)).toBe(0);
  });

  it('rejects when the pusher lacks defects.create', async () => {
    const { organizationId, userId, projectId, deviceId, push } =
      await seedProject(app);
    await tenants.withTenant({ organizationId, userId }, (tx) =>
      tx.membership.update({
        where: { organizationId_userId: { organizationId, userId } },
        data: { role: 'viewer' },
      }),
    );
    const entityId = randomUUID();

    const response = await push({
      organizationId,
      deviceId,
      operations: [
        {
          operationId: randomUUID(),
          entityType: 'defect',
          entityId,
          operationType: 'defect_create',
          baseVersion: null,
          clientCreatedAt: new Date().toISOString(),
          payload: {
            projectId,
            category: 'safety',
            severity: 'high',
            title: 'Should not be created',
          },
        },
      ],
    });

    expect(response.results[0].status).toBe('rejected');
    expect(response.results[0].rejectionCode).toBe('FORBIDDEN');
    expect(await defectCount(organizationId, userId, entityId)).toBe(0);
  });

  it('never reports success without writing a row', async () => {
    const { organizationId, userId, projectId, deviceId, push } =
      await seedProject(app);
    const entityId = randomUUID();
    const before = await defectCount(organizationId, userId);

    const response = await push({
      organizationId,
      deviceId,
      operations: [
        {
          operationId: randomUUID(),
          entityType: 'defect',
          entityId,
          operationType: 'defect_create',
          baseVersion: null,
          clientCreatedAt: new Date().toISOString(),
          payload: {
            projectId,
            category: 'quality',
            severity: 'medium',
            title: 'Regression guard',
          },
        },
      ],
    });

    const after = await defectCount(organizationId, userId);
    if (['applied', 'auto_merged'].includes(response.results[0].status))
      expect(after).toBe(before + 1);
    else expect(after).toBe(before);
  });
});

import { PrismaClient } from '@prisma/client';
import request from 'supertest';

const prisma = new PrismaClient();

async function seedProject(app: Awaited<ReturnType<typeof createApiApp>>) {
  const server = app.getHttpServer();
  const email = `defect.${randomUUID().slice(0, 8)}@example.test`;
  const password = 'correct-horse-battery-staple';

  const csrfResponse = await request(server).get('/api/v1/auth/csrf');
  const csrf = csrfResponse.body.csrfToken as string;
  const cookies = csrfResponse.headers['set-cookie'] as unknown as string[];

  const registration = await request(server)
    .post('/api/v1/auth/register')
    .set('Cookie', cookies)
    .set('x-csrf-token', csrf)
    .send({ email, password })
    .expect(201);
  const userId = registration.body.userId as string;

  // Verification tokens are stored hashed, so flip the flag directly.
  await prisma.user.update({
    where: { id: userId },
    data: { emailVerifiedAt: new Date() },
  });

  const login = await request(server)
    .post('/api/v1/auth/login')
    .set('Cookie', cookies)
    .set('x-csrf-token', csrf)
    .send({ email, password })
    .expect(201);
  const session = login.headers['set-cookie'] as unknown as string[];

  const authed = (method: 'post' | 'get', path: string) =>
    request(server)[method](path)
      .set('Cookie', [...cookies, ...session])
      .set('x-csrf-token', csrf);

  const organization = await authed('post', '/api/v1/organizations')
    .send({ name: 'Defect Test Ltd', slug: `defect-${randomUUID().slice(0, 8)}` })
    .expect(201);
  const organizationId = organization.body.id as string;

  const project = await authed(
    'post',
    `/api/v1/organizations/${organizationId}/projects`,
  )
    .send({
      name: 'Test project',
      code: `T-${randomUUID().slice(0, 6).toUpperCase()}`,
      timezone: 'UTC',
    })
    .expect(201);

  const deviceId = randomUUID();
  await authed('post', `/api/v1/organizations/${organizationId}/devices`)
    .send({ deviceId, name: 'test device', platform: 'web', appVersion: '1.0.0' })
    .expect(201);

  const push = async (body: object) => {
    const response = await authed('post', '/api/v1/sync/push')
      .set('idempotency-key', randomUUID())
      .send(body);
    return response.body as {
      results: { status: string; rejectionCode?: string }[];
    };
  };

  return { organizationId, userId, projectId: project.body.id as string, deviceId, push };
}
