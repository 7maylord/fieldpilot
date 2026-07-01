import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiApp } from '../../src/bootstrap/api-app';
import { loadConfig } from '../../src/config/app.config';
import { PrismaService } from '../../src/database/prisma.service';
import { TenantDatabase } from '../../src/database/tenant-database.service';
import { QueueService } from '../../src/queue/queue.service';
import { OutboxPublisher } from '../../src/queue/outbox-publisher.service';
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

    expect(await prisma.organization.count()).toBe(0);
    expect(await prisma.project.count()).toBe(0);
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
        'projects'
      )
    `;
    expect(policies).toHaveLength(10);
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

    const created = await agent
      .post('/api/v1/organizations')
      .set('x-csrf-token', csrfToken)
      .send({ name: 'Bridge Team', slug: `bridge-${uuidv7()}` })
      .expect(201);
    await agent.get('/api/v1/organizations').expect(200);
    await agent
      .post(`/api/v1/organizations/${created.body.id as string}/teams`)
      .set('x-csrf-token', csrfToken)
      .send({ name: 'Inspectors' })
      .expect(201);
    const history = await tenants.withTenant(
      {
        organizationId: created.body.id as string,
        userId: registration.body.userId as string,
      },
      async (tx) => ({
        audit: await tx.auditEvent.findFirstOrThrow(),
        outbox: await tx.outboxEvent.count(),
      }),
    );
    expect(history.audit.id).toBeTruthy();
    expect(history.outbox).toBeGreaterThan(0);
    await expect(
      tenants.withTenant(
        {
          organizationId: created.body.id as string,
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
        organizationId: created.body.id as string,
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
