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
