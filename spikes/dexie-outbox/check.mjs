import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';

const db = new Dexie('fieldpilot-dexie-outbox-spike');
db.version(1).stores({
  workOrders: 'id, organizationId, syncState',
  pendingOperations: 'id, organizationId, entityId, state',
});

async function saveWorkOrder(workOrder, operation, fail = false) {
  return db.transaction('rw', db.workOrders, db.pendingOperations, async () => {
    await db.workOrders.put(workOrder);
    await db.pendingOperations.add(operation);
    if (fail) throw new Error('simulated transaction failure');
  });
}

async function main() {
  const workOrder = {
    id: 'work-order-1',
    organizationId: 'organization-1',
    title: 'Inspect bridge',
    syncState: 'pending',
  };
  const operation = {
    id: 'operation-1',
    organizationId: 'organization-1',
    entityId: workOrder.id,
    state: 'pending',
  };

  await saveWorkOrder(workOrder, operation);
  assert.deepEqual(await db.workOrders.get(workOrder.id), workOrder);
  assert.deepEqual(await db.pendingOperations.get(operation.id), operation);

  await assert.rejects(
    saveWorkOrder(
      { ...workOrder, id: 'work-order-2' },
      { ...operation, id: 'operation-2', entityId: 'work-order-2' },
      true,
    ),
    /simulated transaction failure/,
  );
  assert.equal(await db.workOrders.get('work-order-2'), undefined);
  assert.equal(await db.pendingOperations.get('operation-2'), undefined);

  console.log('Dexie entity/outbox transaction spike passed');
}

try {
  await main();
} finally {
  await db.delete();
}
