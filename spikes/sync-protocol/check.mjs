import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';

const organizationId = 'organization-1';

class SyncServer {
  #changes = [];
  #entities = new Map();
  #results = new Map();

  push(deviceId, operations) {
    return operations.map((operation) => {
      const key = `${organizationId}:${deviceId}:${operation.id}`;
      const previous = this.#results.get(key);
      if (previous) return { ...previous, status: 'already_applied' };

      this.#entities.set(operation.entityId, operation.payload);
      const result = {
        operationId: operation.id,
        status: 'applied',
        sequence: this.#changes.length + 1,
      };
      this.#changes.push({
        sequence: result.sequence,
        entityId: operation.entityId,
        payload: operation.payload,
      });
      this.#results.set(key, result);
      return result;
    });
  }

  pull(checkpoint = 0) {
    const changes = this.#changes.filter(
      (change) => change.sequence > checkpoint,
    );
    return { changes, checkpoint: changes.at(-1)?.sequence ?? checkpoint };
  }

  get changeCount() {
    return this.#changes.length;
  }
}

function openDevice(name, deviceId) {
  const db = new Dexie(name);
  db.version(1).stores({
    entities: 'id',
    pendingOperations: 'id, state',
    syncState: 'key',
  });

  async function queue(operation) {
    await db.transaction('rw', db.entities, db.pendingOperations, async () => {
      await db.entities.put({ id: operation.entityId, ...operation.payload });
      await db.pendingOperations.put({ ...operation, state: 'pending' });
    });
  }

  async function acquire(owner) {
    return db.transaction('rw', db.syncState, async () => {
      const lock = await db.syncState.get('lock');
      if (lock) return false;
      await db.syncState.put({ key: 'lock', owner });
      return true;
    });
  }

  async function sync(server, owner) {
    if (!(await acquire(owner))) return 'locked';
    try {
      const pending = await db.pendingOperations
        .where('state')
        .equals('pending')
        .toArray();
      const results = server.push(deviceId, pending);
      await db.transaction('rw', db.pendingOperations, async () => {
        for (const result of results) {
          await db.pendingOperations.update(result.operationId, {
            state: 'applied',
            result: result.status,
          });
        }
      });

      const state = await db.syncState.get('checkpoint');
      const pulled = server.pull(state?.value ?? 0);
      await db.transaction('rw', db.entities, db.syncState, async () => {
        for (const change of pulled.changes) {
          await db.entities.put({ id: change.entityId, ...change.payload });
        }
        await db.syncState.put({ key: 'checkpoint', value: pulled.checkpoint });
      });
      return 'synced';
    } finally {
      await db.syncState.delete('lock');
    }
  }

  return { db, queue, sync };
}

async function main() {
  const server = new SyncServer();
  const tabA = openDevice('device-a-db', 'device-a');
  const tabB = openDevice('device-a-db', 'device-a');
  const operation = {
    id: 'operation-1',
    entityId: 'work-order-1',
    payload: { title: 'Inspected by device A' },
  };
  await tabA.queue(operation);

  const tabResults = await Promise.all([
    tabA.sync(server, 'tab-a'),
    tabB.sync(server, 'tab-b'),
  ]);
  assert.deepEqual(tabResults.toSorted(), ['locked', 'synced']);
  assert.equal(server.changeCount, 1, 'multi-tab delivery must apply once');

  const duplicate = server.push('device-a', [operation]);
  assert.equal(duplicate[0].status, 'already_applied');
  assert.equal(
    server.changeCount,
    1,
    'duplicate delivery must not create a change',
  );

  tabA.db.close();
  tabB.db.close();
  const restarted = openDevice('device-a-db', 'device-a');
  assert.equal((await restarted.db.syncState.get('checkpoint')).value, 1);
  assert.equal(
    (await restarted.db.pendingOperations.get(operation.id)).state,
    'applied',
  );

  const deviceB = openDevice('device-b-db', 'device-b');
  await deviceB.sync(server, 'device-b-tab');
  assert.equal(
    (await deviceB.db.entities.get('work-order-1')).title,
    'Inspected by device A',
  );

  await deviceB.queue({
    ...operation,
    entityId: 'work-order-2',
    payload: { title: 'Inspected by device B' },
  });
  await deviceB.sync(server, 'device-b-tab');
  assert.equal(
    server.changeCount,
    2,
    'idempotency keys must be scoped by device',
  );
  await restarted.sync(server, 'restarted-tab');
  assert.equal(
    (await restarted.db.entities.get('work-order-2')).title,
    'Inspected by device B',
  );
  assert.equal((await restarted.db.syncState.get('checkpoint')).value, 2);

  await restarted.db.delete();
  await deviceB.db.delete();
  console.log('Checkpointed sync protocol spike passed');
}

await main();
