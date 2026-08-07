# Defect Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing defect backend reachable — close a live sync data-loss bug, then build the office triage console and offline field capture.

**Architecture:** The defect REST API is complete and needs no new endpoints. Work is (1) a new `defect_create` apply branch in the sync service, (2) two frontend surfaces sharing one status vocabulary module. Office actions are online and version-checked; field capture is offline and auto-merged.

**Tech Stack:** NestJS + Prisma + Postgres (backend), Next.js 16 App Router + React 19 + TanStack Query + Dexie (frontend), Vitest (unit + integration), Playwright (e2e), plain CSS in `globals.css`.

## Global Constraints

- Source spec: `docs/superpowers/specs/2026-08-07-defect-management-design.md`.
- Only `defect_create` is accepted by the sync path. Every other defect operation type must be **rejected with an explicit code**, never silently dropped and never reported as merged.
- The client generates the defect UUID; the server must persist it as the row id. Media links and inspection links are written against that id before push.
- Never introduce a second validation path. Sync reuses `CreateDefectDto` rules via a shared service method.
- Capability checks are re-verified server-side. Client-side capability checks are UX only.
- Do not add screens to `frontend/src/components/office-domain-screens.tsx` (981 lines). Defects get their own files.
- All new user-facing copy is sentence case, active voice, and reuses the existing status vocabulary.
- Styling uses existing classes in `frontend/src/app/globals.css` (`.panel`, `.domain-list`, `.status-pill`, `.priority`, `.datum-*`). Add new classes there only when no existing class fits.
- Every task ends green on: `pnpm --dir backend test`, `pnpm --dir frontend test`, `pnpm --dir frontend lint`, `pnpm --dir frontend typecheck`.

---

### Task 1: Extract a reusable capability check

`CapabilityGuard` resolves role → capability inline. The sync apply path needs the identical logic. Extract it once so the two cannot drift.

**Files:**
- Modify: `backend/src/authorization/capability.ts`
- Modify: `backend/src/authorization/capability.guard.ts:42-48`
- Test: `backend/src/authorization/capability.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `hasCapability(role: string, isExternal: boolean, capability: Capability): boolean` exported from `backend/src/authorization/capability.ts`.

- [ ] **Step 1: Write the failing test**

Append to `backend/src/authorization/capability.test.ts`:

```ts
import { Capability, hasCapability } from './capability';

describe('hasCapability', () => {
  it('grants defect creation to members', () => {
    expect(hasCapability('member', false, Capability.DefectsCreate)).toBe(true);
  });

  it('denies defect creation to viewers', () => {
    expect(hasCapability('viewer', false, Capability.DefectsCreate)).toBe(false);
  });

  it('denies assignment to members', () => {
    expect(hasCapability('member', false, Capability.DefectsAssign)).toBe(false);
  });

  it('treats external members as the external role regardless of stored role', () => {
    expect(hasCapability('admin', true, Capability.OrganizationManage)).toBe(
      false,
    );
    expect(hasCapability('admin', true, Capability.DefectsCreate)).toBe(true);
  });

  it('denies unknown roles', () => {
    expect(hasCapability('robot', false, Capability.DefectsCreate)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir backend exec vitest run src/authorization/capability.test.ts`
Expected: FAIL — `hasCapability` is not exported.

- [ ] **Step 3: Implement the helper**

Append to `backend/src/authorization/capability.ts`:

```ts
export function hasCapability(
  role: string,
  isExternal: boolean,
  capability: Capability,
): boolean {
  const effectiveRole = isExternal ? 'external' : role;
  return roleCapabilities[effectiveRole]?.includes(capability) ?? false;
}
```

- [ ] **Step 4: Use it in the guard**

In `backend/src/authorization/capability.guard.ts`, replace the inline role resolution and check:

```ts
        if (!hasCapability(membership.role, membership.isExternal, capability))
          throw new ForbiddenException('Capability denied');
```

Update the import to `import { Capability, hasCapability } from './capability';` and delete the now-unused `roleCapabilities` import and `effectiveRole` local.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --dir backend test && pnpm --dir backend typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/authorization/
git commit -m 'refactor(auth): extract hasCapability for reuse outside the guard'
```

---

### Task 2: Let the defect service accept a caller-supplied id

`DefectsService.create` hardcodes `id: newId()` and opens its own transaction. Sync must supply the client's UUID and run inside an existing transaction.

**Files:**
- Modify: `backend/src/defects/defects.service.ts:45-112`
- Modify: `backend/src/defects/defects.module.ts`
- Test: `backend/test/integration/defect-sync.test.ts` (new)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `DefectsService.createInTransaction(tx: Prisma.TransactionClient, organizationId: string, actorId: string, input: CreateDefectDto, id: string): Promise<Defect>`
  - `DefectsService` exported from `DefectsModule`.

- [ ] **Step 1: Write the failing test**

Create `backend/test/integration/defect-sync.test.ts`:

```ts
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
```

Add these helpers at the bottom of the same file. `push` is returned from `seedProject` so each test gets its own authenticated session:

```ts
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
    .send({ name: 'Test project', code: `T-${randomUUID().slice(0, 6)}`, timezone: 'UTC' })
    .expect(201);

  const deviceId = randomUUID();
  await authed('post', `/api/v1/organizations/${organizationId}/devices`)
    .send({ deviceId, name: 'test device', platform: 'web', appVersion: '1.0.0' })
    .expect(201);

  const push = async (body: unknown) => {
    const response = await authed('post', '/api/v1/sync/push')
      .set('idempotency-key', randomUUID())
      .send(body);
    return response.body as {
      results: { status: string; rejectionCode?: string }[];
    };
  };

  return { organizationId, userId, projectId: project.body.id as string, deviceId, push };
}
```

If any `.expect(201)` fails, print `response.body` — the RFC 7807 problem details name the failing field.

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL=postgresql://fieldpilot_runtime:fieldpilot_runtime@localhost:5433/fieldpilot pnpm --dir backend exec vitest run test/integration/defect-sync.test.ts`
Expected: FAIL — `createInTransaction` is not a function.

- [ ] **Step 3: Extract the transaction-scoped method**

In `backend/src/defects/defects.service.ts`, move the entire body of the `create` callback into a new public method and have `create` delegate:

```ts
  create(organizationId: string, actorId: string, input: CreateDefectDto) {
    return this.tenants.withMembership(
      { organizationId, userId: actorId },
      (tx) =>
        this.createInTransaction(tx, organizationId, actorId, input, newId()),
    );
  }

  async createInTransaction(
    tx: Prisma.TransactionClient,
    organizationId: string,
    actorId: string,
    input: CreateDefectDto,
    id: string,
  ) {
    await this.assertProjectAccess(tx, organizationId, actorId, input.projectId);
    // ...existing location and asset validation, unchanged...
    const defect = await tx.defect.create({
      data: {
        id,
        organizationId,
        projectId: input.projectId,
        locationId: input.locationId,
        inspectionId: input.inspectionId,
        workOrderId: input.workOrderId,
        assetId: input.assetId,
        category: input.category.trim(),
        severity: input.severity,
        title: input.title.trim(),
        description: input.description,
        dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
        createdBy: actorId,
        statusEvents: {
          create: { id: newId(), organizationId, toStatus: 'reported', actorId },
        },
      },
    });
    await this.record(tx, organizationId, actorId, defect.id, 'defect.reported');
    return defect;
  }
```

Keep the location and asset validation exactly as it is today — move it, do not rewrite it.

- [ ] **Step 4: Export the service**

In `backend/src/defects/defects.module.ts` add `exports: [DefectsService]` to the `@Module` decorator.

- [ ] **Step 5: Run tests to verify they pass**

Run: `docker compose up -d --wait postgres redis && DATABASE_URL=postgresql://fieldpilot_runtime:fieldpilot_runtime@localhost:5433/fieldpilot pnpm --dir backend test:integration`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/defects/ backend/test/integration/defect-sync.test.ts
git commit -m 'refactor(defects): allow a caller-supplied id and expose a transaction-scoped create'
```

---

### Task 3: Fix the `defect_create` sync data-loss bug

`defect_create` is in `supportedOperations` and `appendOperations`, returns `auto_merged`, and matches no apply branch — so it reports success and writes nothing. This task closes that.

**Files:**
- Modify: `backend/src/sync/sync.service.ts:415-470`
- Modify: `backend/src/sync/sync.module.ts`
- Test: `backend/test/integration/defect-sync.test.ts`

**Interfaces:**
- Consumes: `hasCapability` (Task 1), `DefectsService.createInTransaction` (Task 2).
- Produces: sync push accepts `{ entityType: 'defect', operationType: 'defect_create' }`.

- [ ] **Step 1: Write the failing tests**

Add to `backend/test/integration/defect-sync.test.ts`. `push` is a helper that POSTs to `/api/v1/sync/push` with the session cookies and an `idempotency-key` header, following `tests/e2e/launch-journey.spec.ts:299`:

```ts
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
  const row = await prisma.defect.findUnique({ where: { id: entityId } });
  expect(row).not.toBeNull();
  expect(row?.createdBy).toBe(userId);
});

it('is idempotent on replay', async () => {
  const { organizationId, projectId, deviceId, push } = await seedProject(app);
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
  expect(await prisma.defect.count({ where: { id: entityId } })).toBe(1);
});

it('rejects a defect operation type other than defect_create', async () => {
  const { organizationId, projectId, deviceId, push } = await seedProject(app);
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
  expect(await prisma.defect.count({ where: { id: entityId } })).toBe(0);
});

it('rejects when the pusher lacks defects.create', async () => {
  const { organizationId, userId, projectId, deviceId, push } =
    await seedProject(app);
  await prisma.membership.update({
    where: { organizationId_userId: { organizationId, userId } },
    data: { role: 'viewer' },
  });
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
  expect(await prisma.defect.count({ where: { id: entityId } })).toBe(0);
});

it('never reports success without writing a row', async () => {
  const { organizationId, projectId, deviceId, push } = await seedProject(app);
  const entityId = randomUUID();
  const before = await prisma.defect.count();

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

  const after = await prisma.defect.count();
  if (['applied', 'auto_merged'].includes(response.results[0].status))
    expect(after).toBe(before + 1);
  else expect(after).toBe(before);
});
```

The last test is the guard for the original bug: before this task it fails with `auto_merged` and an unchanged row count.

- [ ] **Step 2: Run tests to verify they fail**

Run: `DATABASE_URL=postgresql://fieldpilot_runtime:fieldpilot_runtime@localhost:5433/fieldpilot pnpm --dir backend exec vitest run test/integration/defect-sync.test.ts`
Expected: FAIL — the first test finds no row; the regression guard fails with `auto_merged` and no row, reproducing the bug.

- [ ] **Step 3: Wire the module**

In `backend/src/sync/sync.module.ts` add `DefectsModule` to `imports` and import it from `../defects/defects.module`.

- [ ] **Step 4: Add the apply branch**

In `backend/src/sync/sync.service.ts`, inject `DefectsService` in the constructor. Immediately after the existing `supportedOperations` rejection block (around line 432) and **before** `syncOutcome` is computed, insert:

```ts
    if (operation.entityType === 'defect') {
      if (operation.operationType !== 'defect_create')
        return this.storeOutcome(tx, organizationId, userId, deviceId, operation,
          'rejected', { rejectionCode: 'UNSUPPORTED_OPERATION' });

      const membership = await tx.membership.findUniqueOrThrow({
        where: { organizationId_userId: { organizationId, userId } },
      });
      if (
        !hasCapability(
          membership.role,
          membership.isExternal,
          Capability.DefectsCreate,
        )
      )
        return this.storeOutcome(tx, organizationId, userId, deviceId, operation,
          'rejected', { rejectionCode: 'FORBIDDEN' });

      const payload = plainToInstance(CreateDefectDto, operation.payload);
      const errors = await validate(payload, { whitelist: true });
      if (errors.length)
        return this.storeOutcome(tx, organizationId, userId, deviceId, operation,
          'rejected', { rejectionCode: 'VALIDATION_FAILED' });

      try {
        await this.defects.createInTransaction(
          tx, organizationId, userId, payload, operation.entityId,
        );
      } catch {
        return this.storeOutcome(tx, organizationId, userId, deviceId, operation,
          'rejected', { rejectionCode: 'ENTITY_NOT_FOUND' });
      }
      return this.storeOutcome(tx, organizationId, userId, deviceId, operation,
        'applied');
    }
```

Import `plainToInstance` from `class-transformer`, `validate` from `class-validator`, `CreateDefectDto` from `../defects/dto`, `DefectsService` from `../defects/defects.service`, and `Capability` plus `hasCapability` from `../authorization/capability`.

Returning `applied` rather than `auto_merged` is deliberate: the row now exists, and `applied` is what the client uses to mark the local draft synced.

- [ ] **Step 5: Run tests to verify they pass**

Run: `DATABASE_URL=postgresql://fieldpilot_runtime:fieldpilot_runtime@localhost:5433/fieldpilot pnpm --dir backend test:integration`
Expected: PASS, all five tests.

- [ ] **Step 6: Regenerate the API contract**

Run: `pnpm --dir backend build && pnpm --dir backend openapi:check && pnpm --dir frontend api:check`
Expected: PASS. If `api:check` reports a diff, commit the regenerated `frontend/src/generated/api/schema.d.ts`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/sync/ backend/test/integration/defect-sync.test.ts frontend/src/generated/
git commit -m 'fix(sync): apply defect_create instead of silently reporting success'
```

---

### Task 4: Shared defect vocabulary with a parity guard

Office and field must agree on status labels and allowed transitions, and the client table must match the server state machine exactly.

**Files:**
- Create: `frontend/src/lib/defect-status.ts`
- Test: `frontend/tests/defect-status.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, from `frontend/src/lib/defect-status.ts`:
  - `defectStatuses: readonly DefectStatus[]`
  - `type DefectStatus`
  - `defectTransitions: Record<DefectStatus, readonly DefectStatus[]>`
  - `statusLabel(status: DefectStatus): string`
  - `severityLabel(severity: string): string`
  - `allowedTransitions(status: DefectStatus): readonly DefectStatus[]`
  - `needsOfficeAction: readonly DefectStatus[]`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/defect-status.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  allowedTransitions,
  defectStatuses,
  defectTransitions,
  statusLabel,
} from '../src/lib/defect-status';

const serverSource = readFileSync(
  '../backend/src/defects/defect-state.ts',
  'utf8',
);

describe('defect status vocabulary', () => {
  it('lists every status the server defines', () => {
    for (const status of defectStatuses)
      expect(serverSource).toContain(`'${status}'`);
    const serverCount = (serverSource.match(/^\s{2}'[a-z_]+',$/gm) ?? []).length;
    expect(defectStatuses.length).toBe(serverCount);
  });

  it('matches the server transition table exactly', () => {
    for (const [from, targets] of Object.entries(defectTransitions)) {
      const row = new RegExp(`${from}: \\[([^\\]]*)\\]`).exec(serverSource);
      expect(row, `no server row for ${from}`).not.toBeNull();
      const serverTargets = (row?.[1].match(/'([a-z_]+)'/g) ?? []).map((value) =>
        value.replaceAll("'", ''),
      );
      expect([...targets].sort()).toEqual(serverTargets.sort());
    }
  });

  it('offers no transitions from a terminal status', () => {
    expect(allowedTransitions('cancelled')).toEqual([]);
  });

  it('renders sentence-case labels', () => {
    expect(statusLabel('ready_for_verification')).toBe('Ready for verification');
    expect(statusLabel('correction_in_progress')).toBe(
      'Correction in progress',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir frontend exec vitest run tests/defect-status.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `frontend/src/lib/defect-status.ts`. The transition table must be copied from `backend/src/defects/defect-state.ts` exactly:

```ts
export const defectStatuses = [
  'reported', 'triaged', 'assigned', 'correction_in_progress',
  'ready_for_verification', 'verified', 'closed', 'reopened',
  'deferred', 'cancelled',
] as const;
export type DefectStatus = (typeof defectStatuses)[number];

export const defectTransitions: Record<DefectStatus, readonly DefectStatus[]> = {
  reported: ['triaged', 'deferred', 'cancelled'],
  triaged: ['assigned', 'deferred', 'cancelled'],
  assigned: ['correction_in_progress', 'deferred', 'cancelled'],
  correction_in_progress: ['ready_for_verification'],
  ready_for_verification: ['verified', 'correction_in_progress'],
  verified: ['closed'],
  closed: ['reopened'],
  reopened: ['assigned'],
  deferred: ['triaged', 'cancelled'],
  cancelled: [],
};

/* States waiting on the office, used as the queue's default filter. */
export const needsOfficeAction: readonly DefectStatus[] = [
  'reported', 'triaged', 'ready_for_verification',
];

export function allowedTransitions(status: DefectStatus) {
  return defectTransitions[status] ?? [];
}

export function statusLabel(status: DefectStatus) {
  const words = status.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function severityLabel(severity: string) {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir frontend exec vitest run tests/defect-status.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/defect-status.ts frontend/tests/defect-status.test.ts
git commit -m 'feat(defects): add shared status vocabulary with server parity test'
```

---

### Task 5: Office defect queue

**Files:**
- Create: `frontend/src/app/(office)/[organizationSlug]/defects/page.tsx`
- Create: `frontend/src/components/defects-screen.tsx`
- Modify: `frontend/src/components/app-shell.tsx:22-29` (officeNav Execute group)
- Modify: `frontend/src/app/globals.css`

**Interfaces:**
- Consumes: `statusLabel`, `severityLabel`, `needsOfficeAction`, `DefectStatus` (Task 4).
- Produces: `DefectsScreen({ organizationSlug }: { organizationSlug: string })` exported from `frontend/src/components/defects-screen.tsx`; type `Defect` exported from the same file.

Read `frontend/src/components/projects-screen.tsx` first — it is the closest existing pattern for a project-scoped list, and `GET /organizations/:id/defects` **requires a `projectId` query parameter**, so this screen needs the same project selector.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/defects-screen.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { filterDefects, type Defect } from '../src/components/defects-screen';

const defect = (over: Partial<Defect>): Defect => ({
  id: crypto.randomUUID(), projectId: 'p', title: 't', category: 'quality',
  severity: 'high', status: 'reported', version: 1,
  assignments: [], corrections: [], statusEvents: [], ...over,
});

describe('filterDefects', () => {
  it('defaults to the states waiting on the office', () => {
    const rows = [
      defect({ status: 'reported' }),
      defect({ status: 'closed' }),
      defect({ status: 'ready_for_verification' }),
    ];
    expect(filterDefects(rows, 'Needs action', 'All')).toHaveLength(2);
  });

  it('filters by severity', () => {
    const rows = [defect({ severity: 'critical' }), defect({ severity: 'low' })];
    expect(filterDefects(rows, 'All', 'critical')).toHaveLength(1);
  });

  it('sorts critical first', () => {
    const rows = [defect({ severity: 'low' }), defect({ severity: 'critical' })];
    expect(filterDefects(rows, 'All', 'All')[0].severity).toBe('critical');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir frontend exec vitest run tests/defects-screen.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the screen**

Create `frontend/src/components/defects-screen.tsx` as a `'use client'` component. Export the `Defect` type and this pure helper so the test can reach it without rendering:

```tsx
const severityRank: Record<string, number> = {
  critical: 0, high: 1, medium: 2, low: 3,
};

export function filterDefects(
  defects: Defect[], status: string, severity: string,
) {
  return defects
    .filter((row) =>
      status === 'All' ? true
        : status === 'Needs action'
          ? needsOfficeAction.includes(row.status)
          : row.status === status)
    .filter((row) => severity === 'All' || row.severity === severity)
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}
```

The component fetches projects, then defects for the selected project, with TanStack Query exactly as `projects-screen.tsx` does. Render the queue with `.panel`, `.domain-list`, `.status-pill` and `.priority` classes. Filter controls use `.tabs` for status and `.inline-field` for severity. Empty state uses `.empty-state` with the copy "No defects match this view" / "Change the filter or check another project."

- [ ] **Step 4: Add the route and nav entry**

Create the page, mirroring `frontend/src/app/(office)/[organizationSlug]/projects/page.tsx`:

```tsx
import { DefectsScreen } from '../../../../components/defects-screen';

export default async function DefectsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  return <DefectsScreen organizationSlug={organizationSlug} />;
}
```

In `app-shell.tsx`, add `['Defects', 'defects']` to the `Execute` group of `officeNav`, after `['Assets', 'assets']`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --dir frontend test && pnpm --dir frontend lint && pnpm --dir frontend typecheck && pnpm --dir frontend build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/defects-screen.tsx frontend/src/app/ frontend/tests/defects-screen.test.ts
git commit -m 'feat(defects): add the office defect queue'
```

---

### Task 6: Office defect detail and lifecycle actions

**Files:**
- Modify: `frontend/src/components/defects-screen.tsx`
- Test: `frontend/tests/defects-screen.test.ts`

**Interfaces:**
- Consumes: `allowedTransitions`, `statusLabel` (Task 4); `Defect` (Task 5).
- Produces:
  - `availableActions(defect: Defect, capabilities: string[]): DefectAction[]` where `type DefectAction = { kind: 'transition'; to: DefectStatus } | { kind: 'assign' } | { kind: 'correct' } | { kind: 'verify' }`, from `frontend/src/components/defects-screen.tsx`
  - `capabilitiesForRole(role: string, isExternal: boolean): string[]`, added to `frontend/src/lib/defect-status.ts` (Task 4's file) and covered by extending Task 4's parity test

- [ ] **Step 1: Write the failing test**

Append to `frontend/tests/defects-screen.test.ts`:

```ts
import { availableActions } from '../src/components/defects-screen';

describe('availableActions', () => {
  it('offers assignment only on triaged defects and only with the capability', () => {
    const triaged = defect({ status: 'triaged' });
    expect(
      availableActions(triaged, ['defects.assign']).some((a) => a.kind === 'assign'),
    ).toBe(true);
    expect(
      availableActions(triaged, []).some((a) => a.kind === 'assign'),
    ).toBe(false);
    expect(
      availableActions(defect({ status: 'reported' }), ['defects.assign'])
        .some((a) => a.kind === 'assign'),
    ).toBe(false);
  });

  it('offers verification only when ready and only with the capability', () => {
    const ready = defect({ status: 'ready_for_verification' });
    expect(
      availableActions(ready, ['defects.verify']).some((a) => a.kind === 'verify'),
    ).toBe(true);
    expect(availableActions(ready, []).some((a) => a.kind === 'verify')).toBe(false);
  });

  it('offers no actions on a cancelled defect', () => {
    expect(availableActions(defect({ status: 'cancelled' }), [
      'defects.create', 'defects.assign', 'defects.verify',
    ])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir frontend exec vitest run tests/defects-screen.test.ts`
Expected: FAIL — `availableActions` is not exported.

- [ ] **Step 3: Implement actions and the detail panel**

Add to `defects-screen.tsx`:

```tsx
export type DefectAction =
  | { kind: 'transition'; to: DefectStatus }
  | { kind: 'assign' }
  | { kind: 'correct' }
  | { kind: 'verify' };

export function availableActions(
  defect: Defect, capabilities: string[],
): DefectAction[] {
  const can = (capability: string) => capabilities.includes(capability);
  const actions: DefectAction[] = allowedTransitions(defect.status)
    .filter(() => can('defects.create'))
    .map((to) => ({ kind: 'transition', to }) as const);
  if (defect.status === 'triaged' && can('defects.assign'))
    actions.push({ kind: 'assign' });
  if (defect.status === 'assigned' && can('defects.create'))
    actions.push({ kind: 'correct' });
  if (defect.status === 'ready_for_verification' && can('defects.verify'))
    actions.push({ kind: 'verify' });
  return actions;
}
```

Render the detail panel beside the queue using `.field-detail` and `.detail-stack`. Each action calls its endpoint with `apiRequest`, always sending `version: defect.version`. Correction submission posts `rootCause`, `correctiveAction` and `evidenceIds: []`.

Capabilities come from the membership role already loaded in `app-shell.tsx`; fetch `/organizations` in this screen and map the role through the same table `frontend/src/lib/defect-status.ts` does not own — add a small `capabilitiesForRole(role: string, isExternal: boolean): string[]` to `frontend/src/lib/defect-status.ts` mirroring `backend/src/authorization/capability.ts`, and extend the Task 4 parity test to assert the two role tables match.

On a 409 response, show `.notice` with: "This defect changed while you were looking at it. Reload to see the latest." and a button that refetches. Never retry the stale payload.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir frontend test && pnpm --dir frontend typecheck && pnpm --dir frontend build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/defects-screen.tsx frontend/src/lib/defect-status.ts frontend/tests/
git commit -m 'feat(defects): add lifecycle actions with capability gating and stale-version handling'
```

---

### Task 7: Field defect capture, offline

**Files:**
- Create: `frontend/src/components/field-defect-capture.tsx`
- Create: `frontend/src/app/(field)/field/defects/page.tsx`
- Modify: `frontend/src/components/app-shell.tsx:41-55` (fieldNav)
- Test: `frontend/tests/field-defect-capture.test.ts`

**Interfaces:**
- Consumes: `createPendingOperation` and `defectDraftRepository` from `frontend/src/lib/offline/repositories.ts`; `db` from `frontend/src/lib/offline/database.ts`.
- Produces, from `frontend/src/components/field-defect-capture.tsx`:
  - `type DefectCaptureInput`
  - `buildDefectOperation(input: DefectCaptureInput, organizationId: string): { draft: OfflineEntity; operation: PendingOperation }`
  - `captureState(draft: { syncState: string }, operationState: string): 'synced' | 'held' | 'rejected'`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/field-defect-capture.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildDefectOperation } from '../src/components/field-defect-capture';

describe('buildDefectOperation', () => {
  const input = {
    projectId: 'project-1', category: 'safety', severity: 'critical',
    title: 'Loose plank', description: 'Bay 3', inspectionId: undefined,
    locationId: undefined,
  };

  it('uses one client-generated id for both the draft and the operation', () => {
    const { draft, operation } = buildDefectOperation(input, 'org-1');
    expect(operation.entityId).toBe(draft.id);
    expect(draft.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('emits an append-style create with no base version', () => {
    const { operation } = buildDefectOperation(input, 'org-1');
    expect(operation.entityType).toBe('defect');
    expect(operation.action).toBe('defect_create');
    expect(operation.baseVersion).toBeNull();
  });

  it('marks the draft as pending so the datum bar counts it', () => {
    const { draft } = buildDefectOperation(input, 'org-1');
    expect(draft.syncState).toBe('pending');
    expect(draft.tombstone).toBe(false);
  });

  it('omits empty optional links rather than sending nulls', () => {
    const { operation } = buildDefectOperation(input, 'org-1');
    expect(operation.payload).not.toHaveProperty('inspectionId');
    expect(operation.payload).not.toHaveProperty('locationId');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir frontend exec vitest run tests/field-defect-capture.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement capture**

Create `frontend/src/components/field-defect-capture.tsx` as a `'use client'` component exporting the pure builder plus the screen:

```tsx
export type DefectCaptureInput = {
  projectId: string; category: string; severity: string; title: string;
  description?: string; inspectionId?: string; locationId?: string;
};

export function buildDefectOperation(
  input: DefectCaptureInput, organizationId: string,
) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    projectId: input.projectId, category: input.category,
    severity: input.severity, title: input.title,
  };
  if (input.description) payload.description = input.description;
  if (input.inspectionId) payload.inspectionId = input.inspectionId;
  if (input.locationId) payload.locationId = input.locationId;
  return {
    draft: {
      id, organizationId, serverVersion: 0, localUpdatedAt: now,
      serverUpdatedAt: null, syncState: 'pending' as const, tombstone: false,
      ...payload, status: 'reported',
    },
    operation: createPendingOperation({
      organizationId, entityType: 'defect', entityId: id,
      action: 'defect_create', baseVersion: null, payload,
    }),
  };
}
```

The form writes both records in one Dexie transaction over `db.defectDrafts` and `db.pendingOperations`, then clears the fields and shows "Defect saved. It uploads when you reconnect." Use `.project-form` classes and the existing `MediaCapture` component from `frontend/src/components/media-capture.tsx` for the photo, linking media with `entityType: 'defect'` and `entityId: draft.id`.

Below the form, list local defects from `defectDraftRepository.list(organizationId)`, showing `syncState` with the existing datum styling so unsynced ones read as held on the device.

- [ ] **Step 4: Keep rejected captures visible (FR-SYNC-005)**

Write this test first in `frontend/tests/field-defect-capture.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { captureState } from '../src/components/field-defect-capture';

describe('captureState', () => {
  it('reports a rejected defect as needing attention, not as synced', () => {
    expect(captureState({ syncState: 'pending' }, 'rejected')).toBe('rejected');
  });

  it('never reports synced while an operation is still pending', () => {
    expect(captureState({ syncState: 'pending' }, 'pending')).toBe('held');
  });

  it('reports synced only once the operation applied', () => {
    expect(captureState({ syncState: 'synced' }, 'applied')).toBe('synced');
  });
});
```

Then implement:

```tsx
export function captureState(
  draft: { syncState: string },
  operationState: string,
) {
  if (['rejected', 'failed_permanently'].includes(operationState))
    return 'rejected' as const;
  return draft.syncState === 'synced' && operationState === 'applied'
    ? ('synced' as const)
    : ('held' as const);
}
```

In the local defects list, a `rejected` row renders with the `.warning-text` class and the copy "Not accepted by the server. Open Conflicts to resolve." The draft row and its body are never deleted — the captured content must survive whatever the rejection reason was.

- [ ] **Step 5: Add the route and nav entry**

Create `frontend/src/app/(field)/field/defects/page.tsx` mirroring `frontend/src/app/(field)/field/downloads/page.tsx`. In `app-shell.tsx`, add `['Defects', 'defects']` to the `On site` group of `fieldNav`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --dir frontend test && pnpm --dir frontend lint && pnpm --dir frontend typecheck && pnpm --dir frontend build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/field-defect-capture.tsx frontend/src/app/ frontend/src/components/app-shell.tsx frontend/tests/
git commit -m 'feat(defects): capture defects offline from the field'
```

---

### Task 8: Raise a defect from a failed inspection item (FR-INSP-005)

**Files:**
- Modify: `frontend/src/components/offline-inspection-form.tsx`
- Test: `frontend/tests/field-defect-capture.test.ts`

**Interfaces:**
- Consumes: `buildDefectOperation`, `DefectCaptureInput` (Task 7).
- Produces: `defectSeedFromItem(item: { id: string; label: string }, context: { projectId: string; inspectionId: string; locationId?: string }): DefectCaptureInput`.

- [ ] **Step 1: Write the failing test**

Append to `frontend/tests/field-defect-capture.test.ts`:

```ts
import { defectSeedFromItem } from '../src/components/field-defect-capture';

describe('defectSeedFromItem', () => {
  const context = { projectId: 'p1', inspectionId: 'i1', locationId: 'l1' };

  it('carries the inspection link through so the defect traces back', () => {
    const seed = defectSeedFromItem({ id: 'f1', label: 'Bearing condition' }, context);
    expect(seed.inspectionId).toBe('i1');
    expect(seed.projectId).toBe('p1');
    expect(seed.locationId).toBe('l1');
  });

  it('seeds the title from the failed item label', () => {
    const seed = defectSeedFromItem({ id: 'f1', label: 'Bearing condition' }, context);
    expect(seed.title).toBe('Bearing condition');
  });

  it('defaults to medium severity so the reporter makes a deliberate choice', () => {
    expect(defectSeedFromItem({ id: 'f1', label: 'x' }, context).severity)
      .toBe('medium');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir frontend exec vitest run tests/field-defect-capture.test.ts`
Expected: FAIL — `defectSeedFromItem` is not exported.

- [ ] **Step 3: Implement the seed and the prompt**

Add to `field-defect-capture.tsx`:

```tsx
export function defectSeedFromItem(
  item: { id: string; label: string },
  context: { projectId: string; inspectionId: string; locationId?: string },
): DefectCaptureInput {
  return {
    projectId: context.projectId,
    inspectionId: context.inspectionId,
    locationId: context.locationId,
    title: item.label,
    category: 'quality',
    severity: 'medium',
  };
}
```

In `offline-inspection-form.tsx`, when an item is set to a failing value, render a `.notice` beneath it: "This item failed. Raise a defect?" with a button that opens the capture form pre-filled from `defectSeedFromItem`. Saving writes through the same Dexie transaction as Task 7 — do not duplicate that write.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir frontend test && pnpm --dir frontend typecheck && pnpm --dir frontend build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ frontend/tests/
git commit -m 'feat(defects): raise a defect from a failed inspection item'
```

---

### Task 9: End-to-end and accessibility coverage

**Files:**
- Modify: `frontend/tests/e2e/launch-journey.spec.ts:325-400`
- Modify: `frontend/tests/e2e/accessibility-audit.spec.ts:4-18`

**Interfaces:**
- Consumes: every route from Tasks 5–8.
- Produces: no code, only coverage.

- [ ] **Step 1: Add the new routes to the axe sweep**

In `accessibility-audit.spec.ts`, add `'/horizon/defects'` and `'/field/defects'` to the path array.

- [ ] **Step 2: Run the audit to verify it fails or passes honestly**

Run: `pnpm --dir frontend exec playwright test tests/e2e/accessibility-audit.spec.ts`
Expected: PASS with zero violations. Fix any contrast or target-size findings in `globals.css` before continuing.

- [ ] **Step 3: Convert the defect lifecycle steps to UI**

`launch-journey.spec.ts` currently drives defect creation, triage, assignment, correction, verification and closure through the API. Replace the API calls for triage → assignment → verification → closure with UI interactions on `/${organization.slug}/defects`, keeping the API calls that set up prerequisites. Assert the defect title is visible in the queue and that its status pill reads `Closed` at the end.

Use `.first()` on any `getByText` that matches both the queue row and the detail panel — the same strict-mode issue already handled at lines 151 and 159.

- [ ] **Step 4: Add an offline capture assertion**

After the existing `context.setOffline(true)` block, raise a defect through the field form, assert it appears locally, go back online, sync, and assert the row reaches the server:

```ts
await context.setOffline(true);
await page.goto('/field/defects');
await page.getByLabel('Title').fill('Offline raised defect');
await page.getByLabel('Category').fill('safety');
await page.getByRole('button', { name: 'Save defect' }).click();
await expect(page.getByText('Defect saved.')).toBeVisible();
await context.setOffline(false);
// trigger sync, then assert via the API that the defect exists
```

This is the regression test for the original data-loss bug at the level a user experiences it.

- [ ] **Step 5: Run the full suite**

Run: `docker compose up -d --wait postgres redis minio mailpit clamav && pnpm --dir frontend test:e2e`
Expected: PASS, all specs. ClamAV must be healthy or media-linked steps fail with `quarantined`.

- [ ] **Step 6: Commit**

```bash
git add frontend/tests/e2e/
git commit -m 'test(defects): cover the defect lifecycle and offline capture end to end'
```

---

## Verification

Run the full CI sequence before opening a PR:

```bash
pnpm --dir frontend format:check && pnpm --dir backend format:check
pnpm --dir frontend lint && pnpm --dir backend lint
pnpm --dir frontend typecheck && pnpm --dir backend typecheck
pnpm --dir frontend test && pnpm --dir backend test
docker compose up -d --wait postgres redis minio mailpit clamav
pnpm --dir backend test:integration
pnpm --dir frontend build && pnpm --dir backend build
pnpm --dir backend openapi:check && pnpm --dir frontend api:check
pnpm --dir frontend test:e2e
docker compose down -v
```

## Out of scope, tracked separately

`asset_create` carries the identical data-loss bug — it sits in both `supportedOperations` and `appendOperations`, and `tx.asset` writes in the sync path are zero. Task 3's regression guard is written so the same test shape can be copied for assets. Raise it as its own issue; do not widen this plan.
