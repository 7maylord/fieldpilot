import { randomUUID, createHash } from 'node:crypto';
import { createServer, type Server } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApiApp } from '../../src/bootstrap/api-app';
import { loadConfig } from '../../src/config/app.config';

const prisma = new PrismaClient();

describe('media listing by entity', () => {
  let app: Awaited<ReturnType<typeof createApiApp>>;
  let scanner: Server;

  beforeAll(async () => {
    // Fake ClamAV daemon (same wire protocol used by platform.test.ts, own
    // port so parallel test files never fight over 3311).
    scanner = createServer((socket) => {
      let received = Buffer.alloc(0);
      socket.on('data', (chunk) => {
        received = Buffer.concat([received, chunk]);
        if (
          received.length >= 4 &&
          received.subarray(-4).every((byte) => byte === 0)
        )
          socket.end(
            received.includes(Buffer.from('EICAR'))
              ? 'stream: Eicar-Test-Signature FOUND\0'
              : 'stream: OK\0',
          );
      });
    });
    await new Promise<void>((resolve) =>
      scanner.listen(3312, '127.0.0.1', resolve),
    );
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = '3312';
    app = await createApiApp(loadConfig({ NODE_ENV: 'test' }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve, reject) =>
      scanner.close((error) => (error ? reject(error) : resolve())),
    );
    await prisma.$disconnect();
  });

  async function seedProject() {
    const server = app.getHttpServer();
    const email = `media.${randomUUID().slice(0, 8)}@example.test`;
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
        name: 'Media Test Ltd',
        slug: `media-${randomUUID().slice(0, 8)}`,
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

    const defect = await authed(
      'post',
      `/api/v1/organizations/${organizationId}/defects`,
    )
      .send({
        projectId: project.body.id,
        category: 'quality',
        severity: 'high',
        title: 'Spalling at pier 4',
      })
      .expect(201);

    return {
      authed,
      organizationId,
      projectId: project.body.id as string,
      defectId: defect.body.id as string,
    };
  }

  async function uploadMedia(
    authed: (method: 'post' | 'get', path: string) => request.Test,
    organizationId: string,
    projectId: string,
    entityId: string,
    bytes: Buffer<ArrayBuffer>,
  ) {
    const session = await authed(
      'post',
      `/api/v1/organizations/${organizationId}/media/upload-sessions`,
    )
      .send({
        projectId,
        mimeType: 'image/png',
        byteSize: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        entityType: 'defect',
        entityId,
      })
      .expect(201);
    const part = await fetch(session.body.partUrls[0].url as string, {
      method: 'PUT',
      body: bytes,
    });
    const etag = part.headers.get('etag');
    const completed = await authed(
      'post',
      `/api/v1/organizations/${organizationId}/media/upload-sessions/${session.body.sessionId as string}/complete`,
    )
      .send({ parts: [{ partNumber: 1, etag }] })
      .expect(201);
    return {
      mediaId: session.body.mediaId as string,
      status: completed.body.status as string,
    };
  }

  const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  it('returns only ready, clean media linked to the given entity', async () => {
    const { authed, organizationId, projectId, defectId } = await seedProject();
    const otherDefect = await authed(
      'post',
      `/api/v1/organizations/${organizationId}/defects`,
    )
      .send({
        projectId,
        category: 'quality',
        severity: 'low',
        title: 'A different defect',
      })
      .expect(201);

    const clean = await uploadMedia(
      authed,
      organizationId,
      projectId,
      defectId,
      Buffer.concat([pngHeader, Buffer.from('clean bytes')]),
    );
    expect(clean.status).toBe('ready');

    const infected = await uploadMedia(
      authed,
      organizationId,
      projectId,
      defectId,
      Buffer.concat([pngHeader, Buffer.from('EICAR')]),
    );
    expect(infected.status).toBe('quarantined');

    const linkedElsewhere = await uploadMedia(
      authed,
      organizationId,
      projectId,
      otherDefect.body.id as string,
      Buffer.concat([pngHeader, Buffer.from('belongs to the other defect')]),
    );
    expect(linkedElsewhere.status).toBe('ready');

    const response = await authed(
      'get',
      `/api/v1/organizations/${organizationId}/media?projectId=${projectId}&entityType=defect&entityId=${defectId}`,
    ).expect(200);

    expect(response.body.map((item: { id: string }) => item.id)).toEqual([
      clean.mediaId,
    ]);
  });
});
