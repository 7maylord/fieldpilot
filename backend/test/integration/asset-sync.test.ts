import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiApp } from '../../src/bootstrap/api-app';
import { loadConfig } from '../../src/config/app.config';
import { AssetsService } from '../../src/assets/assets.service';
import { TenantDatabase } from '../../src/database/tenant-database.service';

describe('asset creation with a caller-supplied id', () => {
  let app: Awaited<ReturnType<typeof createApiApp>>;

  beforeAll(async () => {
    app = await createApiApp(loadConfig({ NODE_ENV: 'test' }));
    await app.init();
  });

  afterAll(async () => app.close());

  it('persists the id the caller provides', async () => {
    const assets = app.get(AssetsService);
    const tenants = app.get(TenantDatabase);
    const { organizationId, userId, projectId, assetTypeId } =
      await seedProject(app);
    const id = randomUUID();

    const created = await tenants.withMembership(
      { organizationId, userId },
      (tx) =>
        assets.createInTransaction(
          tx,
          organizationId,
          userId,
          {
            projectId,
            assetTypeId,
            name: 'Batching plant',
            qrCode: `QR-${randomUUID().slice(0, 8)}`,
          },
          id,
        ),
    );

    expect(created.id).toBe(id);
    expect(created.status).toBe('active');
  });
});

describe('asset_create via sync push', () => {
  let app: Awaited<ReturnType<typeof createApiApp>>;
  let tenants: TenantDatabase;

  beforeAll(async () => {
    app = await createApiApp(loadConfig({ NODE_ENV: 'test' }));
    await app.init();
    tenants = app.get(TenantDatabase);
  });

  afterAll(async () => app.close());

  // `assets` and `organization_memberships` are protected by FORCE ROW LEVEL
  // SECURITY (see prisma/migrations/20260629000100_platform_foundation),
  // scoped to `app.organization_id`. Verification reads go through
  // `tenants.withTenant`, same as the app code does — see the identical note
  // in defect-sync.test.ts.
  const assetCount = (organizationId: string, userId: string, id?: string) =>
    tenants.withTenant({ organizationId, userId }, (tx) =>
      tx.asset.count({ where: id ? { id } : { organizationId } }),
    );

  it('creates the asset row and reports applied', async () => {
    const { organizationId, userId, projectId, assetTypeId, deviceId, push } =
      await seedProject(app);
    const entityId = randomUUID();
    const operationId = randomUUID();

    const response = await push({
      organizationId,
      deviceId,
      operations: [
        {
          operationId,
          entityType: 'asset',
          entityId,
          operationType: 'asset_create',
          baseVersion: null,
          clientCreatedAt: new Date().toISOString(),
          payload: {
            projectId,
            assetTypeId,
            name: 'Dangote concrete pump',
            qrCode: `QR-${randomUUID().slice(0, 8)}`,
          },
        },
      ],
    });

    expect(response.results[0]!.status).toBe('applied');
    const row = await tenants.withTenant({ organizationId, userId }, (tx) =>
      tx.asset.findUnique({ where: { id: entityId } }),
    );
    expect(row).not.toBeNull();
    expect(row?.organizationId).toBe(organizationId);
  });

  it('is idempotent on replay', async () => {
    const { organizationId, userId, projectId, assetTypeId, deviceId, push } =
      await seedProject(app);
    const entityId = randomUUID();
    const operationId = randomUUID();
    const operation = {
      operationId,
      entityType: 'asset',
      entityId,
      operationType: 'asset_create',
      baseVersion: null,
      clientCreatedAt: new Date().toISOString(),
      payload: {
        projectId,
        assetTypeId,
        name: 'Replayed asset',
        qrCode: `QR-${randomUUID().slice(0, 8)}`,
      },
    };

    const first = await push({
      organizationId,
      deviceId,
      operations: [operation],
    });
    const second = await push({
      organizationId,
      deviceId,
      operations: [operation],
    });

    expect(first.results[0]!.status).toBe('applied');
    expect(second.results[0]!.status).toBe('already_applied');
    expect(await assetCount(organizationId, userId, entityId)).toBe(1);
  });

  it('rejects an asset operation type other than asset_create', async () => {
    const { organizationId, userId, deviceId, push } = await seedProject(app);
    const entityId = randomUUID();

    const response = await push({
      organizationId,
      deviceId,
      operations: [
        {
          operationId: randomUUID(),
          entityType: 'asset',
          entityId,
          operationType: 'update',
          baseVersion: 1,
          clientCreatedAt: new Date().toISOString(),
          payload: { status: 'retired' },
        },
      ],
    });

    expect(response.results[0]!.status).toBe('rejected');
    expect(response.results[0]!.rejectionCode).toBe('UNSUPPORTED_OPERATION');
    expect(await assetCount(organizationId, userId, entityId)).toBe(0);
  });

  it('rejects when the pusher lacks assets.manage', async () => {
    const { organizationId, userId, projectId, assetTypeId, deviceId, push } =
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
          entityType: 'asset',
          entityId,
          operationType: 'asset_create',
          baseVersion: null,
          clientCreatedAt: new Date().toISOString(),
          payload: {
            projectId,
            assetTypeId,
            name: 'Should not be created',
            qrCode: `QR-${randomUUID().slice(0, 8)}`,
          },
        },
      ],
    });

    expect(response.results[0]!.status).toBe('rejected');
    expect(response.results[0]!.rejectionCode).toBe('FORBIDDEN');
    expect(await assetCount(organizationId, userId, entityId)).toBe(0);
  });

  it('never reports success without writing a row', async () => {
    const { organizationId, userId, projectId, assetTypeId, deviceId, push } =
      await seedProject(app);
    const entityId = randomUUID();
    const before = await assetCount(organizationId, userId);

    const response = await push({
      organizationId,
      deviceId,
      operations: [
        {
          operationId: randomUUID(),
          entityType: 'asset',
          entityId,
          operationType: 'asset_create',
          baseVersion: null,
          clientCreatedAt: new Date().toISOString(),
          payload: {
            projectId,
            assetTypeId,
            name: 'Regression guard',
            qrCode: `QR-${randomUUID().slice(0, 8)}`,
          },
        },
      ],
    });

    const after = await assetCount(organizationId, userId);
    if (['applied', 'auto_merged'].includes(response.results[0]!.status))
      expect(after).toBe(before + 1);
    else expect(after).toBe(before);
  });
});

// Separate describe block (own app instance, own throttler bucket) — see the
// identical rationale in defect-sync.test.ts: the block above already spends
// its full AUTH_THROTTLE_LIMIT_PER_MINUTE budget on its 5 seedProject() calls.
describe('asset_create batch isolation on invalid references', () => {
  let app: Awaited<ReturnType<typeof createApiApp>>;
  let tenants: TenantDatabase;

  beforeAll(async () => {
    app = await createApiApp(loadConfig({ NODE_ENV: 'test' }));
    await app.init();
    tenants = app.get(TenantDatabase);
  });

  afterAll(async () => app.close());

  it('rejects an asset_create referencing a nonexistent asset type without aborting the rest of the batch', async () => {
    const { organizationId, userId, projectId, assetTypeId, deviceId, push } =
      await seedProject(app);
    const badEntityId = randomUUID();
    const goodEntityId = randomUUID();

    const response = await push({
      organizationId,
      deviceId,
      operations: [
        {
          operationId: randomUUID(),
          entityType: 'asset',
          entityId: badEntityId,
          operationType: 'asset_create',
          baseVersion: null,
          clientCreatedAt: new Date().toISOString(),
          payload: {
            projectId,
            assetTypeId: randomUUID(),
            name: 'References an asset type that does not exist',
            qrCode: `QR-${randomUUID().slice(0, 8)}`,
          },
        },
        {
          operationId: randomUUID(),
          entityType: 'asset',
          entityId: goodEntityId,
          operationType: 'asset_create',
          baseVersion: null,
          clientCreatedAt: new Date().toISOString(),
          payload: {
            projectId,
            assetTypeId,
            name: 'Still applies after the bad operation in the same batch',
            qrCode: `QR-${randomUUID().slice(0, 8)}`,
          },
        },
      ],
    });

    expect(response.results[0]).toMatchObject({
      status: 'rejected',
      rejectionCode: 'ENTITY_NOT_FOUND',
    });
    expect(response.results[1]!.status).toBe('applied');

    const [badCount, goodCount] = await tenants.withTenant(
      { organizationId, userId },
      async (tx) => [
        await tx.asset.count({ where: { id: badEntityId } }),
        await tx.asset.count({ where: { id: goodEntityId } }),
      ],
    );
    expect(badCount).toBe(0);
    expect(goodCount).toBe(1);
  });

  it('reports already_applied for a re-sent asset id under a new operationId, without aborting the rest of the batch', async () => {
    const { organizationId, userId, projectId, assetTypeId, deviceId, push } =
      await seedProject(app);
    const entityId = randomUUID();

    const first = await push({
      organizationId,
      deviceId,
      operations: [
        {
          operationId: randomUUID(),
          entityType: 'asset',
          entityId,
          operationType: 'asset_create',
          baseVersion: null,
          clientCreatedAt: new Date().toISOString(),
          payload: {
            projectId,
            assetTypeId,
            name: 'Original device registration',
            qrCode: `QR-${randomUUID().slice(0, 8)}`,
          },
        },
      ],
    });
    expect(first.results[0]!.status).toBe('applied');

    // Simulates a device re-registering with a new deviceId while stale
    // pendingOperations for the same asset id survive in local IndexedDB, so
    // the client re-sends an asset_create for an id the server already has,
    // under a brand-new operationId.
    const otherEntityId = randomUUID();
    const second = await push({
      organizationId,
      deviceId,
      operations: [
        {
          operationId: randomUUID(),
          entityType: 'asset',
          entityId,
          operationType: 'asset_create',
          baseVersion: null,
          clientCreatedAt: new Date().toISOString(),
          payload: {
            projectId,
            assetTypeId,
            name: 'Re-sent after device re-registration',
            qrCode: `QR-${randomUUID().slice(0, 8)}`,
          },
        },
        {
          operationId: randomUUID(),
          entityType: 'asset',
          entityId: otherEntityId,
          operationType: 'asset_create',
          baseVersion: null,
          clientCreatedAt: new Date().toISOString(),
          payload: {
            projectId,
            assetTypeId,
            name: 'Unrelated valid create in the same batch',
            qrCode: `QR-${randomUUID().slice(0, 8)}`,
          },
        },
      ],
    });

    expect(second.results[0]!.status).toBe('already_applied');
    expect(second.results[1]!.status).toBe('applied');

    const [duplicateCount, otherCount] = await tenants.withTenant(
      { organizationId, userId },
      async (tx) => [
        await tx.asset.count({ where: { id: entityId } }),
        await tx.asset.count({ where: { id: otherEntityId } }),
      ],
    );
    expect(duplicateCount).toBe(1);
    expect(otherCount).toBe(1);
  });
});

import { PrismaClient } from '@prisma/client';
import request from 'supertest';

const prisma = new PrismaClient();

async function seedProject(app: Awaited<ReturnType<typeof createApiApp>>) {
  const server = app.getHttpServer();
  const email = `asset.${randomUUID().slice(0, 8)}@example.test`;
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
    request(server)
      [method](path)
      .set('Cookie', [...cookies, ...session])
      .set('x-csrf-token', csrf);

  const organization = await authed('post', '/api/v1/organizations')
    .send({
      name: 'Asset Test Ltd',
      slug: `asset-${randomUUID().slice(0, 8)}`,
    })
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

  const assetType = await authed(
    'post',
    `/api/v1/organizations/${organizationId}/assets/types`,
  )
    .send({ name: `Pump ${randomUUID().slice(0, 8)}` })
    .expect(201);

  const deviceId = randomUUID();
  await authed('post', `/api/v1/organizations/${organizationId}/devices`)
    .send({
      deviceId,
      name: 'test device',
      platform: 'web',
      appVersion: '1.0.0',
    })
    .expect(201);

  const push = async (body: object) => {
    const response = await authed('post', '/api/v1/sync/push')
      .set('idempotency-key', randomUUID())
      .send(body);
    return response.body as {
      results: { status: string; rejectionCode?: string }[];
    };
  };

  return {
    organizationId,
    userId,
    projectId: project.body.id as string,
    assetTypeId: assetType.body.id as string,
    deviceId,
    push,
  };
}
