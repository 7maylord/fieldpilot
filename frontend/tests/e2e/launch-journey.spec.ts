import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from '@playwright/test';

const API_ORIGIN = 'http://localhost:3011';
const API = `${API_ORIGIN}/api/v1`;

test('Nigerian QA journey: company setup, work orders, offline field sync, defect closure, and report publication', async ({
  context,
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const runId = randomUUID().slice(0, 8);
  const password = 'correct-horse-battery-staple';
  const ownerEmail = `amina.balogun.${runId}@ekoqa.example.test`;
  const fieldEmail = `chinedu.okafor.${runId}@ekoqa.example.test`;

  const owner = await signUp(request, ownerEmail, password);
  const post = owner.post;
  const patch = owner.patch;

  const organization = await post('/organizations', {
    name: 'Eko Bridge Inspection Ltd',
    slug: `eko-bridge-${runId}`,
  });
  await post(`/organizations/${organization.id}/invitations`, {
    email: fieldEmail,
    role: 'member',
  });
  const fieldApi = await playwrightRequest.newContext();
  let fieldUserId = '';
  try {
    const field = await signUp(fieldApi, fieldEmail, password);
    fieldUserId = field.registration.userId;
    await field.post('/invitations/accept', {
      token: invitationToken(fieldEmail),
    });
  } finally {
    await fieldApi.dispose();
  }
  expect(fieldUserId).not.toBe('');
  const team = await post(`/organizations/${organization.id}/teams`, {
    name: 'Lagos QA Crew',
  });
  await post(`/organizations/${organization.id}/teams/${team.id}/members`, {
    userId: fieldUserId,
  });
  const project = await post(`/organizations/${organization.id}/projects`, {
    name: 'Third Mainland Bridge expansion',
    code: `LAGOS-${runId.toUpperCase()}`,
    timezone: 'Africa/Lagos',
  });
  const site = await post(
    `/organizations/${organization.id}/projects/${project.id}/sites`,
    { name: 'Oworonshoki yard', code: 'OWOR-01' },
  );
  const location = await post(
    `/organizations/${organization.id}/projects/${project.id}/sites/${site.id}/locations`,
    {
      name: 'Ikoyi Pier 4',
      locationType: 'gps_point',
      latitude: 6.5,
      longitude: 3.4,
    },
  );
  const shiftStartsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const shiftEndsAt = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString();
  const workOrder = await post(
    `/organizations/${organization.id}/work-orders`,
    {
      projectId: project.id,
      siteId: site.id,
      locationId: location.id,
      title: 'Inspect Ikoyi expansion joint',
      workType: 'inspection',
      priority: 'high',
      plannedStart: shiftStartsAt,
      plannedEnd: shiftEndsAt,
      evidenceRequirements: [],
    },
  );
  await post(
    `/organizations/${organization.id}/work-orders/schedule-resources`,
    {
      resourceType: 'team',
      resourceId: team.id,
      name: 'Lagos QA Crew',
      skills: ['concrete', 'safety'],
      projectIds: [project.id],
      shifts: [
        {
          startsAt: shiftStartsAt,
          endsAt: shiftEndsAt,
        },
      ],
    },
  );
  await post(
    `/organizations/${organization.id}/work-orders/${workOrder.id}/assignments`,
    {
      version: 1,
      assigneeType: 'team',
      assigneeId: team.id,
    },
  );
  const assetType = await post(
    `/organizations/${organization.id}/assets/types`,
    {
      name: 'Batching plant',
    },
  );
  const asset = await post(`/organizations/${organization.id}/assets`, {
    projectId: project.id,
    assetTypeId: assetType.id,
    locationId: location.id,
    name: 'Dangote concrete pump',
    qrCode: `EKO-PUMP-${runId.toUpperCase()}`,
    serialNumber: `LAG-${runId.toUpperCase()}`,
    manufacturer: 'Innoson Works',
  });

  expect(owner.cookies.some(({ name }) => name === 'fieldpilot_session')).toBe(
    true,
  );
  await context.addCookies(owner.cookies);
  await page.goto('/');
  await expect(
    page.evaluate(
      async ({ api, slug }) => {
        const response = await fetch(`${api}/organizations`, {
          credentials: 'include',
        });
        return response.ok
          ? (await response.json()).some(
              (organization: { slug: string }) => organization.slug === slug,
            )
          : response.status;
      },
      { api: API, slug: organization.slug },
    ),
  ).resolves.toBe(true);
  await page.goto(`/${organization.slug}/projects`);
  // Named in both the project list and the auto-selected detail panel.
  await expect(
    page.getByText('Third Mainland Bridge expansion').first(),
  ).toBeVisible();
  await page.goto(`/${organization.slug}/sites`);
  await expect(page.getByText('Oworonshoki yard')).toBeVisible();
  await expect(page.getByText('Ikoyi Pier 4')).toBeVisible();
  await page.goto(`/${organization.slug}/work`);
  await expect(
    page.getByText('Inspect Ikoyi expansion joint').first(),
  ).toBeVisible();
  const uiWorkOrder = 'Repair Apapa scaffold access';
  await page.getByLabel('Title').fill(uiWorkOrder);
  await page.getByLabel('Type').fill('repair');
  await page.getByLabel('Priority').selectOption('critical');
  await page.getByLabel('Photo').check();
  await page.getByRole('button', { name: 'Create work order' }).click();
  await expect(page.getByText(uiWorkOrder).first()).toBeVisible();
  await page.goto(`/${organization.slug}/dispatch`);
  await expect(page.getByText('Lagos QA Crew')).toBeVisible();
  await page.goto(`/${organization.slug}/assets`);
  await expect(page.getByText('Dangote concrete pump')).toBeVisible();
  await expect(page.getByText(asset.qrCode)).toBeVisible();

  const schema = {
    schemaVersion: 1,
    title: 'Lagos concrete QA',
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
    { name: 'Lagos concrete QA', schema },
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
    name: 'Lagos field tablet',
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

  // Regression coverage for the original data-loss bug: a defect raised
  // offline through the field form must survive the reconnect-and-sync
  // round trip, not just the direct-API path exercised above.
  await page.goto('/field/today');
  // "Repository refreshed" is also the eyebrow's *default* text (offline
  // starts false), so it renders on mount before the refresh actually
  // lands — poll IndexedDB directly for the write it's supposed to
  // confirm instead of trusting that label.
  await expect.poll(() => readFieldContext(page)).toBeTruthy();
  // Warm the service worker's runtime cache for /field/defects — the SW
  // only precaches a fixed shell list and falls back to /field/today for
  // any other route it has never fetched while online.
  await page.goto('/field/defects');
  await expect(page.getByLabel('Title')).toBeVisible();
  await context.setOffline(true);
  await page.goto('/field/defects');
  await page.getByLabel('Title').fill('Offline raised defect');
  await page.getByLabel('Category').fill('safety');
  await page.getByRole('button', { name: 'Save defect' }).click();
  await expect(page.getByText('Defect saved on this device.')).toBeVisible();
  await expect(page.getByText('Offline raised defect')).toBeVisible();
  const offlineDefectOperation = await page.evaluate(async () => {
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
      request.onsuccess = () =>
        resolve(
          request.result.find(
            (item: { entityType: string }) => item.entityType === 'defect',
          ),
        );
      request.onerror = () => reject(request.error);
    });
  });
  await context.setOffline(false);
  const offlineDefectSync = await post(
    '/sync/push',
    {
      organizationId: organization.id,
      deviceId,
      operations: [
        {
          operationId: offlineDefectOperation.id,
          entityType: offlineDefectOperation.entityType,
          entityId: offlineDefectOperation.entityId,
          operationType: offlineDefectOperation.action,
          baseVersion: offlineDefectOperation.baseVersion,
          clientCreatedAt: offlineDefectOperation.clientCreatedAt,
          payload: offlineDefectOperation.payload,
        },
      ],
    },
    { 'idempotency-key': randomUUID() },
  );
  expect(offlineDefectSync.results[0].status).toBe('applied');
  const offlineDefects = await owner.get(
    `/organizations/${organization.id}/defects?projectId=${project.id}`,
  );
  expect(
    offlineDefects.some(
      (row: { title: string }) => row.title === 'Offline raised defect',
    ),
  ).toBe(true);

  const defect = await post(`/organizations/${organization.id}/defects`, {
    projectId: project.id,
    locationId: location.id,
    inspectionId: inspection.id,
    category: 'quality',
    severity: 'high',
    title: 'Ikoyi pier temperature variance',
  });
  await page.goto(`/${organization.slug}/defects`);
  await page.getByRole('button', { name: 'All' }).click();
  // Named in both the queue row and the auto-selected detail panel.
  await expect(page.getByText(defect.title).first()).toBeVisible();
  await page.getByRole('button', { name: defect.title }).click();
  const defectActions = page.locator('.actions');

  await defectActions.getByRole('button', { name: 'Triaged' }).click();
  await expect(
    defectActions.getByRole('button', { name: 'Assign', exact: true }),
  ).toBeVisible();

  await defectActions
    .getByRole('button', { name: 'Assign', exact: true })
    .click();
  const assignForm = page.locator('form.project-form');
  // Not getByLabel('Assignee'): the wrapping <label> folds its <select>'s
  // own displayed option text into the computed accessible name (becoming
  // "Assignee Select assignee Lagos QA Crew"), so no exact match on
  // "Assignee" is possible and a substring match collides with the
  // sibling "Assignee type" label. The name attribute sidesteps both.
  await assignForm
    .locator('select[name="assigneeId"]')
    .selectOption({ label: team.name });
  await assignForm.getByRole('button', { name: 'Assign' }).click();
  await expect(
    defectActions.getByRole('button', { name: 'Correction in progress' }),
  ).toBeVisible();

  await defectActions
    .getByRole('button', { name: 'Correction in progress' })
    .click();
  await expect(
    defectActions.getByRole('button', {
      name: 'Submit correction',
      exact: true,
    }),
  ).toBeVisible();

  // Picked up by CorrectForm's evidence checklist below — the office UI
  // selects it by list position, not by id, so the return value is unused.
  await uploadEvidence(
    request,
    owner.csrf,
    organization.id,
    project.id,
    'defect',
    defect.id,
  );

  await defectActions
    .getByRole('button', { name: 'Submit correction', exact: true })
    .click();
  const correctForm = page.locator('form.project-form');
  await correctForm
    .getByLabel('Root cause')
    .fill('Lekki aggregate delivery delay');
  await correctForm
    .getByLabel('Corrective action')
    .fill('Reworked pour and verified concrete temperature');
  await correctForm.getByRole('checkbox').check();
  await correctForm.getByRole('button', { name: 'Submit correction' }).click();
  await expect(
    defectActions.getByRole('button', { name: 'Verify' }),
  ).toBeVisible();

  await defectActions.getByRole('button', { name: 'Verify' }).click();
  const verifyForm = page.locator('form.project-form');
  await verifyForm.getByRole('button', { name: 'Record decision' }).click();
  await expect(
    defectActions.getByRole('button', { name: 'Closed' }),
  ).toBeVisible();

  await defectActions.getByRole('button', { name: 'Closed' }).click();
  // Named in both the queue row and the detail panel's status pill.
  await expect(page.getByText(defect.title).first()).toBeVisible();
  await expect(page.getByText('Closed').first()).toBeVisible();

  const report = await post(`/organizations/${organization.id}/daily-reports`, {
    projectId: project.id,
    reportDate: new Date().toISOString().slice(0, 10),
    weatherNotes: 'Clear Lagos morning',
  });
  await patch(
    `/organizations/${organization.id}/daily-reports/${report.id}/revisions`,
    {
      content: {
        weatherNotes: 'Clear Lagos morning',
        supervisorNotes: 'Amina Balogun signed off QA checks',
      },
    },
  );
  await post(
    `/organizations/${organization.id}/daily-reports/${report.id}/reviews`,
    {
      decision: 'approved',
    },
  );
  const signature = await uploadEvidence(
    request,
    owner.csrf,
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

// Reads the field app's cached organization context. Note: the IndexedDB
// connection this opens must be closed before returning — leaving it open
// starves the app's own Dexie connection of the write it's making at the
// same time, which reads back as a false "not written yet".
function readFieldContext(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('fieldpilot');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const record = await new Promise((resolve, reject) => {
      const request = database
        .transaction('syncState')
        .objectStore('syncState')
        .get('field-context');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return record;
  });
}

async function signUp(
  request: APIRequestContext,
  email: string,
  password: string,
) {
  const csrfResponse = await request.get(`${API}/auth/csrf`);
  expect(csrfResponse.ok()).toBe(true);
  const csrf = (await csrfResponse.json()).csrfToken as string;
  const post = endpoint(request, 'POST', csrf);
  const patch = endpoint(request, 'PATCH', csrf);
  const get = endpoint(request, 'GET', csrf);
  const registration = await post('/auth/register', { email, password });
  const verificationToken = emailVerificationToken(registration.userId);
  expect(verificationToken).not.toBe('');
  await post('/auth/verify-email', { token: verificationToken });
  const login = await request.fetch(`${API}/auth/login`, {
    method: 'POST',
    data: { email, password },
    headers: { 'x-csrf-token': csrf },
  });
  const text = await login.text();
  expect(login.status(), `POST /auth/login: ${text}`).toBe(201);
  return {
    csrf,
    cookies: responseCookies(login),
    post,
    patch,
    get,
    registration,
  };
}

function responseCookies(response: APIResponse) {
  return response
    .headersArray()
    .filter(({ name }) => name.toLowerCase() === 'set-cookie')
    .flatMap(({ value }) => {
      const pair = value.split(';')[0] ?? '';
      const separator = pair.indexOf('=');
      return separator > 0
        ? [
            {
              name: pair.slice(0, separator),
              value: pair.slice(separator + 1),
              domain: 'localhost',
              path: '/',
            },
          ]
        : [];
    });
}

function emailVerificationToken(userId: string) {
  return postgresValue(
    `SELECT payload->>'verificationToken' FROM identity_outbox_events WHERE user_id = '${userId}' ORDER BY created_at DESC LIMIT 1`,
  );
}

function invitationToken(email: string) {
  return postgresValue(
    `SELECT payload->>'token' FROM outbox_events WHERE event_type = 'membership.invited' AND payload->>'email' = '${email}' ORDER BY created_at DESC LIMIT 1`,
  );
}

function postgresValue(sql: string) {
  return execFileSync(
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
      sql,
    ],
    { cwd: path.resolve(process.cwd(), '..'), encoding: 'utf8' },
  ).trim();
}

function endpoint(
  request: APIRequestContext,
  method: 'POST' | 'PATCH' | 'GET',
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
