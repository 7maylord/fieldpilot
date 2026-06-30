import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, test } from 'vitest';
import {
  FieldPilotDatabase,
  type OfflineEntity,
  type PendingOperation,
} from '../src/lib/offline/database';
import { saveWorkOrderWithOperation } from '../src/lib/offline/repositories';
import { acquireSyncLock, releaseSyncLock } from '../src/lib/offline/sync-lock';
import { getCheckpoint, setCheckpoint } from '../src/lib/offline/checkpoints';
import {
  createRecoveryExport,
  relieveStoragePressure,
} from '../src/lib/offline/recovery';

const names: string[] = [];
const makeName = () => {
  const name = `fieldpilot-test-${crypto.randomUUID()}`;
  names.push(name);
  return name;
};

afterEach(async () => {
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
    createdAt: now,
  };
  return { workOrder, operation };
}

describe('offline platform', () => {
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
    await legacy.table('pendingOperations').add(legacyOperation);
    legacy.close();
    const database = new FieldPilotDatabase(name);
    const migrated = await database.pendingOperations.get(operation.id);
    expect(migrated).toMatchObject({
      id: operation.id,
      attempts: 0,
      priority: 0,
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
