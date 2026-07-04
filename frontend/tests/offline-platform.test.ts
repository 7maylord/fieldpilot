import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  FieldPilotDatabase,
  type OfflineEntity,
  type PendingOperation,
} from '../src/lib/offline/database';
import {
  createPendingOperation,
  readyOperations,
  saveWorkOrderWithOperation,
  scheduleOperationRetry,
} from '../src/lib/offline/repositories';
import { acquireSyncLock, releaseSyncLock } from '../src/lib/offline/sync-lock';
import { getCheckpoint, setCheckpoint } from '../src/lib/offline/checkpoints';
import {
  createRecoveryExport,
  relieveStoragePressure,
} from '../src/lib/offline/recovery';
import {
  importBootstrap,
  type BootstrapPackage,
} from '../src/lib/offline/bootstrap';
import { syncNow } from '../src/lib/offline/sync';
import {
  saveInspectionDraft,
  type InspectionDraft,
} from '../src/lib/offline/inspections';

const names: string[] = [];
const makeName = () => {
  const name = `fieldpilot-test-${crypto.randomUUID()}`;
  names.push(name);
  return name;
};

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)));
});

function records() {
  const now = new Date().toISOString();
  const workOrder: OfflineEntity = {
    id: 'work-1',
    organizationId: 'org-1',
    serverVersion: 1,
    localUpdatedAt: now,
    serverUpdatedAt: now,
    syncState: 'pending',
    tombstone: false,
    title: 'Inspect bridge',
  };
  const operation: PendingOperation = {
    id: 'operation-1',
    organizationId: 'org-1',
    entityType: 'work_order',
    entityId: workOrder.id,
    action: 'update',
    baseVersion: 1,
    payload: { title: workOrder.title },
    state: 'pending',
    priority: 1,
    attempts: 0,
    clientCreatedAt: now,
    nextAttemptAt: null,
  };
  return { workOrder, operation };
}

describe('offline platform', () => {
  test('stores an inspection draft and its exact form-version operation atomically', async () => {
    const database = new FieldPilotDatabase(makeName());
    const draft: InspectionDraft = {
      id: 'inspection-1',
      organizationId: 'org-1',
      formVersionId: 'form-v3',
      answers: { result: 'ok' },
      serverVersion: 1,
      localUpdatedAt: new Date().toISOString(),
      serverUpdatedAt: null,
      syncState: 'synced',
      tombstone: false,
    };
    await saveInspectionDraft(
      draft,
      {
        schemaVersion: 1,
        title: 'Check',
        fields: [
          { id: 'result', type: 'text', label: 'Result', required: true },
        ],
      },
      true,
      database,
    );
    expect(await database.inspectionDrafts.get(draft.id)).toMatchObject({
      formVersionId: 'form-v3',
      syncState: 'pending',
    });
    expect(
      await database.pendingOperations.toCollection().first(),
    ).toMatchObject({
      entityId: draft.id,
      action: 'form_submission_create',
      payload: { formVersionId: 'form-v3' },
    });
    database.close();
  });

  test('imports bootstrap atomically without overwriting pending local work', async () => {
    const database = new FieldPilotDatabase(makeName());
    const { workOrder } = records();
    await database.workOrders.put(workOrder);
    const snapshot: BootstrapPackage = {
      checkpoint: 'opaque-1',
      serverTime: new Date().toISOString(),
      packageExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      projects: [{ id: 'project-1', organizationId: 'org-1', version: 2 }],
      sites: [],
      locations: [],
      workOrders: [
        {
          id: 'work-1',
          organizationId: 'org-1',
          version: 2,
          title: 'Server title',
        },
      ],
      formVersions: [],
      referenceData: [],
    };
    await importBootstrap('org-1', snapshot, database);
    expect(await database.projects.get('project-1')).toMatchObject({
      serverVersion: 2,
      syncState: 'synced',
    });
    expect(await database.workOrders.get('work-1')).toMatchObject({
      title: 'Inspect bridge',
      syncState: 'pending',
    });
    expect(await getCheckpoint('org-1', database)).toBe('opaque-1');

    database.workOrders.hook('creating', () => {
      throw new Error('simulated import failure');
    });
    await expect(
      importBootstrap(
        'org-1',
        {
          ...snapshot,
          checkpoint: 'opaque-2',
          projects: [{ id: 'project-2', organizationId: 'org-1', version: 1 }],
          workOrders: [{ id: 'work-2', organizationId: 'org-1', version: 1 }],
        },
        database,
      ),
    ).rejects.toThrow('simulated import failure');
    expect(await database.projects.get('project-2')).toBeUndefined();
    expect(await getCheckpoint('org-1', database)).toBe('opaque-1');
    database.close();
  });

  test('commits an entity and its operation atomically because local work must never lose its sync intent', async () => {
    const database = new FieldPilotDatabase(makeName());
    const { workOrder, operation } = records();
    await saveWorkOrderWithOperation(workOrder, operation, database);
    expect(await database.workOrders.get(workOrder.id)).toMatchObject(
      workOrder,
    );
    expect(await database.pendingOperations.get(operation.id)).toMatchObject(
      operation,
    );
    await expect(
      saveWorkOrderWithOperation(
        { ...workOrder, id: 'work-2' },
        { ...operation, entityId: 'work-2' },
        database,
      ),
    ).rejects.toThrow();
    expect(await database.workOrders.get('work-2')).toBeUndefined();
    await expect(
      saveWorkOrderWithOperation(
        { ...workOrder, id: 'wrong' },
        operation,
        database,
      ),
    ).rejects.toThrow('scope must match');
    expect(await database.workOrders.get('wrong')).toBeUndefined();
    database.close();
  });

  test('upgrades an old snapshot without dropping queued operations', async () => {
    const name = makeName();
    const legacy = new Dexie(name);
    legacy.version(1).stores({
      pendingOperations: 'id, organizationId, entityId, state, createdAt',
    });
    const { operation } = records();
    const legacyOperation = { ...operation } as Partial<PendingOperation>;
    delete legacyOperation.attempts;
    delete legacyOperation.priority;
    delete legacyOperation.clientCreatedAt;
    delete legacyOperation.nextAttemptAt;
    (legacyOperation as { createdAt?: string }).createdAt =
      operation.clientCreatedAt;
    await legacy.table('pendingOperations').add(legacyOperation);
    legacy.close();
    const database = new FieldPilotDatabase(name);
    const migrated = await database.pendingOperations.get(operation.id);
    expect(migrated).toMatchObject({
      id: operation.id,
      attempts: 0,
      priority: 0,
      clientCreatedAt: operation.clientCreatedAt,
      nextAttemptAt: null,
    });
    database.close();
  });

  test('keeps operation identity durable and orders due retries by business priority', async () => {
    const name = makeName();
    let database = new FieldPilotDatabase(name);
    const structured = createPendingOperation({
      organizationId: 'org-1',
      entityType: 'work_order',
      entityId: 'work-1',
      action: 'update',
      baseVersion: 4,
      payload: {},
    });
    const photo = createPendingOperation({
      organizationId: 'org-1',
      entityType: 'photo',
      entityId: 'photo-1',
      action: 'append',
      baseVersion: null,
      payload: {},
    });
    await database.pendingOperations.bulkAdd([photo, structured]);
    await scheduleOperationRetry(
      structured.id,
      'NETWORK_UNAVAILABLE',
      database,
    );
    await database.pendingOperations.update(structured.id, {
      nextAttemptAt: new Date(0).toISOString(),
    });
    database.close();

    database = new FieldPilotDatabase(name);
    const ready = await readyOperations('org-1', 100, new Date(), database);
    expect(ready.map(({ id }) => id)).toEqual([structured.id, photo.id]);
    expect(ready[0]).toMatchObject({
      id: structured.id,
      baseVersion: 4,
      state: 'retry_scheduled',
      attempts: 1,
      lastErrorCode: 'NETWORK_UNAVAILABLE',
    });
    database.close();
  });

  test('pushes once, accepts duplicate-safe outcomes, and advances pull checkpoint atomically', async () => {
    const database = new FieldPilotDatabase(makeName());
    const { workOrder, operation } = records();
    await saveWorkOrderWithOperation(workOrder, operation, database);
    await setCheckpoint('org-1', crypto.randomUUID(), database);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        const path = String(url);
        if (path.endsWith('/auth/csrf'))
          return new Response(JSON.stringify({ csrfToken: 'test-csrf' }), {
            status: 200,
          });
        if (path.endsWith('/sync/push')) {
          const body = JSON.parse(String(init?.body)) as {
            operations: { operationId: string }[];
          };
          return new Response(
            JSON.stringify({
              results: [
                {
                  operationId: body.operations[0]!.operationId,
                  status: 'applied',
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({
            changes: [
              {
                sequence: '1',
                organizationId: 'org-1',
                entityType: 'work_order',
                entityId: 'work-1',
                version: 2,
                payload: { title: 'Server accepted title' },
                occurredAt: new Date().toISOString(),
              },
            ],
            nextCheckpoint: 'next-checkpoint',
            hasMore: false,
          }),
          { status: 200 },
        );
      }),
    );
    expect(await syncNow('org-1', 'device-1', 'tab-1', database)).toBe(true);
    expect(await database.pendingOperations.get(operation.id)).toMatchObject({
      state: 'applied',
    });
    expect(await database.workOrders.get('work-1')).toMatchObject({
      title: 'Server accepted title',
      serverVersion: 2,
      syncState: 'synced',
    });
    expect(await getCheckpoint('org-1', database)).toBe('next-checkpoint');
    const retry = createPendingOperation({
      organizationId: 'org-1',
      entityType: 'work_order',
      entityId: 'work-1',
      action: 'update',
      baseVersion: 2,
      payload: { title: 'Retry me' },
    });
    await database.pendingOperations.add(retry);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 503 })),
    );
    await expect(
      syncNow('org-1', 'device-1', 'tab-after-failure', database),
    ).rejects.toThrow('API request failed (503)');
    expect(await database.pendingOperations.get(retry.id)).toMatchObject({
      state: 'retry_scheduled',
      attempts: 1,
      lastErrorCode: 'SYNC_REQUEST_FAILED',
    });
    database.close();
  });

  test('allows one tab to sync and safely recovers an expired lease', async () => {
    const database = new FieldPilotDatabase(makeName());
    expect(await acquireSyncLock('tab-a', database)).toBe(true);
    expect(await acquireSyncLock('tab-b', database)).toBe(false);
    await releaseSyncLock('tab-a', database);
    expect(await acquireSyncLock('tab-b', database)).toBe(true);
    await database.syncState.put({
      key: 'sync-lock',
      owner: 'dead-tab',
      expiresAt: Date.now() - 1,
    });
    expect(await acquireSyncLock('tab-c', database)).toBe(true);
    await setCheckpoint('org-1', 'opaque-checkpoint-1', database);
    expect(await getCheckpoint('org-1', database)).toBe('opaque-checkpoint-1');
    database.close();
  });

  test('exports pending work and clears only disposable data under storage pressure', async () => {
    const database = new FieldPilotDatabase(makeName());
    const { workOrder, operation } = records();
    await saveWorkOrderWithOperation(workOrder, operation, database);
    await database.cachedDocuments.put({ ...workOrder, id: 'cached-1' });
    const recovery = JSON.parse(
      await (await createRecoveryExport('org-1', database)).text(),
    ) as { pendingOperations: PendingOperation[] };
    expect(recovery.pendingOperations).toHaveLength(1);
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { storage: { estimate: async () => ({ usage: 90, quota: 100 }) } },
    });
    expect(await relieveStoragePressure(database)).toBe(true);
    expect(await database.cachedDocuments.count()).toBe(0);
    expect(await database.pendingOperations.count()).toBe(1);
    database.close();
  });
});
