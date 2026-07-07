import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, test, type APIRequestContext } from '@playwright/test';

const API = 'http://localhost:3011/api/v1';

test('pilot journey: registration to offline inspection, review, defect closure, and report publication', async ({
  context,
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const csrfResponse = await request.get(`${API}/auth/csrf`);
  expect(csrfResponse.ok()).toBe(true);
  const csrf = (await csrfResponse.json()).csrfToken as string;
  const post = endpoint(request, 'POST', csrf);
  const patch = endpoint(request, 'PATCH', csrf);
  const email = `pilot-${randomUUID()}@example.test`;
  const password = 'correct-horse-battery-staple';

  const registration = await post('/auth/register', { email, password });
  const verificationToken = execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'fieldpilot',
      '-d',
      'fieldpilot',
      '-Atc',
      `SELECT payload->>'verificationToken' FROM identity_outbox_events WHERE user_id = '${registration.userId}' ORDER BY created_at DESC LIMIT 1`,
    ],
    { cwd: path.resolve(process.cwd(), '..'), encoding: 'utf8' },
  ).trim();
  expect(verificationToken).not.toBe('');
  await post('/auth/verify-email', { token: verificationToken });
  await post('/auth/login', { email, password });

  const organization = await post('/organizations', {
    name: 'Pilot Team',
    slug: `pilot-${randomUUID()}`,
  });
  const team = await post(`/organizations/${organization.id}/teams`, {
    name: 'Field crew',
  });
  await post(`/organizations/${organization.id}/teams/${team.id}/members`, {
    userId: registration.userId,
  });
  const project = await post(`/organizations/${organization.id}/projects`, {
    name: 'Pilot bridge',
    code: `PILOT-${randomUUID().slice(0, 8).toUpperCase()}`,
    timezone: 'Africa/Lagos',
  });
  const site = await post(
    `/organizations/${organization.id}/projects/${project.id}/sites`,
    { name: 'Main bridge', code: 'SITE-01' },
  );
  const location = await post(
    `/organizations/${organization.id}/projects/${project.id}/sites/${site.id}/locations`,
    {
      name: 'Pier one',
      locationType: 'gps_point',
      latitude: 6.5,
      longitude: 3.4,
    },
  );
  const workOrder = await post(
    `/organizations/${organization.id}/work-orders`,
    {
      projectId: project.id,
      siteId: site.id,
      locationId: location.id,
      title: 'Inspect pier',
      workType: 'inspection',
      priority: 'high',
      evidenceRequirements: [],
    },
  );

  const schema = {
    schemaVersion: 1,
    title: 'Pilot inspection',
    fields: [
      {
        id: 'temperature',
        type: 'number',
        label: 'Concrete temperature',
        required: true,
      },
    ],
  };
  const template = await post(
    `/organizations/${organization.id}/form-templates`,
    { name: 'Pilot inspection', schema },
  );
  const formVersionId = template.versions[0].id as string;
  await post(
    `/organizations/${organization.id}/form-templates/${template.id}/publish`,
  );
  const inspection = await post(
    `/organizations/${organization.id}/inspections`,
    {
      projectId: project.id,
      workOrderId: workOrder.id,
      formVersionId,
      inspectionType: 'quality',
    },
  );
  const deviceId = randomUUID();
  await post(`/organizations/${organization.id}/devices`, {
    deviceId,
    name: 'Pilot tablet',
    platform: 'web',
    appVersion: '1.0.0',
  });
  const bootstrap = await post('/sync/bootstrap', {
    deviceId,
    organizationId: organization.id,
    projectIds: [project.id],
    lastCheckpoint: null,
  });
  expect(bootstrap.inspections.map(({ id }: { id: string }) => id)).toContain(
    inspection.id,
  );

  await page.goto(`/field/inspections/${inspection.id}`);
  await page.getByRole('button', { name: 'Download package' }).click();
  await expect(page.getByText('Offline package downloaded.')).toBeVisible();
  await page.evaluate(
    async ({ inspection, organization, project, formVersionId, schema }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open('fieldpilot');
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          ['formVersions', 'inspectionDrafts'],
          'readwrite',
        );
        const base = {
          organizationId: organization.id,
          serverVersion: 1,
          localUpdatedAt: new Date().toISOString(),
          serverUpdatedAt: new Date().toISOString(),
          syncState: 'synced',
          tombstone: false,
        };
        transaction.objectStore('formVersions').put({
          ...base,
          id: formVersionId,
          schema,
        });
        transaction.objectStore('inspectionDrafts').put({
          ...base,
          id: inspection.id,
          projectId: project.id,
          formVersionId,
          answers: {},
          draftAnswers: {},
          outcome: 'incomplete',
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    },
    { inspection, organization, project, formVersionId, schema },
  );
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await page.goto(`/field/inspections/${inspection.id}`);
  await expect(page.getByLabel('Concrete temperature *')).toBeVisible();
  const cachedUrls = await page.evaluate(async () =>
    (
      await Promise.all(
        (await caches.keys()).map(async (name) =>
          (await (await caches.open(name)).keys()).map(({ url }) => url),
        ),
      )
    ).flat(),
  );
  expect(cachedUrls).toContain(page.url());
  await context.setOffline(true);
  await page.reload();
  await page.getByLabel('Concrete temperature *').fill('10.5');
  await page.getByLabel('Outcome').selectOption('passed');
  await page.getByRole('button', { name: 'Submit when online' }).click();
  await expect(
    page.getByText('Inspection queued for submission.'),
  ).toBeVisible();
  const operation = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('fieldpilot');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const request = database
        .transaction('pendingOperations')
        .objectStore('pendingOperations')
        .getAll();
      request.onsuccess = () => resolve(request.result.at(-1));
      request.onerror = () => reject(request.error);
    });
  });
  await context.setOffline(false);
  const sync = await post(
    '/sync/push',
    {
      organizationId: organization.id,
      deviceId,
      operations: [
        {
          operationId: operation.id,
          entityType: operation.entityType,
          entityId: operation.entityId,
          operationType: operation.action,
          baseVersion: operation.baseVersion,
          clientCreatedAt: operation.clientCreatedAt,
          payload: operation.payload,
        },
      ],
    },
    { 'idempotency-key': randomUUID() },
  );
  expect(sync.results[0].status).toBe('applied');
  const review = await post(
    `/organizations/${organization.id}/inspections/${inspection.id}/reviews`,
    { decision: 'approve' },
  );
  expect(review.decision).toBe('approve');

  const defect = await post(`/organizations/${organization.id}/defects`, {
    projectId: project.id,
    locationId: location.id,
    inspectionId: inspection.id,
    category: 'quality',
    severity: 'high',
    title: 'Temperature variance',
  });
  await post(
    `/organizations/${organization.id}/defects/${defect.id}/transitions`,
    {
      version: 1,
      status: 'triaged',
    },
  );
  await post(
    `/organizations/${organization.id}/defects/${defect.id}/assignments`,
    {
      version: 2,
      assigneeType: 'team',
      assigneeId: team.id,
    },
  );
  await post(
    `/organizations/${organization.id}/defects/${defect.id}/transitions`,
    {
      version: 3,
      status: 'correction_in_progress',
    },
  );
  const evidence = await uploadEvidence(
    request,
    csrf,
    organization.id,
    project.id,
    'defect',
    defect.id,
  );
  const correction = await post(
    `/organizations/${organization.id}/defects/${defect.id}/corrections`,
    {
      version: 4,
      rootCause: 'Cooling delay',
      correctiveAction: 'Reworked pour',
      evidenceIds: [evidence],
    },
  );
  await post(
    `/organizations/${organization.id}/defects/${defect.id}/verifications`,
    {
      version: 5,
      correctionId: correction.id,
      decision: 'verified',
    },
  );
  const closed = await post(
    `/organizations/${organization.id}/defects/${defect.id}/transitions`,
    { version: 6, status: 'closed' },
  );
  expect(closed.status).toBe('closed');

  const report = await post(`/organizations/${organization.id}/daily-reports`, {
    projectId: project.id,
    reportDate: '2026-07-05',
    weatherNotes: 'Clear',
  });
  await patch(
    `/organizations/${organization.id}/daily-reports/${report.id}/revisions`,
    { content: { weatherNotes: 'Clear', supervisorNotes: 'Pilot complete' } },
  );
  await post(
    `/organizations/${organization.id}/daily-reports/${report.id}/reviews`,
    {
      decision: 'approved',
    },
  );
  const signature = await uploadEvidence(
    request,
    csrf,
    organization.id,
    project.id,
    'daily_report',
    report.id,
  );
  await post(
    `/organizations/${organization.id}/daily-reports/${report.id}/signatures`,
    { mediaId: signature },
  );
  const published = await post(
    `/organizations/${organization.id}/daily-reports/${report.id}/publish`,
  );
  expect(published.status).toBe('published');
});

function endpoint(
  request: APIRequestContext,
  method: 'POST' | 'PATCH',
  csrf: string,
) {
  return async (
    path: string,
    data?: unknown,
    headers: Record<string, string> = {},
  ) => {
    const response = await request.fetch(`${API}${path}`, {
      method,
      data,
      headers: { 'x-csrf-token': csrf, ...headers },
    });
    const text = await response.text();
    expect(response.status(), `${method} ${path}: ${text}`).toBe(
      method === 'POST' ? 201 : 200,
    );
    return text ? JSON.parse(text) : undefined;
  };
}

async function uploadEvidence(
  request: APIRequestContext,
  csrf: string,
  organizationId: string,
  projectId: string,
  entityType: string,
  entityId: string,
) {
  const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
  const post = endpoint(request, 'POST', csrf);
  const upload = await post(
    `/organizations/${organizationId}/media/upload-sessions`,
    {
      projectId,
      mimeType: 'image/png',
      byteSize: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      entityType,
      entityId,
    },
  );
  const part = await request.put(upload.partUrls[0].url, { data: bytes });
  expect(part.ok()).toBe(true);
  const completed = await post(
    `/organizations/${organizationId}/media/upload-sessions/${upload.sessionId}/complete`,
    { parts: [{ partNumber: 1, etag: part.headers().etag }] },
  );
  expect(completed.status).toBe('ready');
  return upload.mediaId as string;
}
