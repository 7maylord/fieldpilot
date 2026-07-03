import type { EntityTable } from 'dexie';
import {
  db,
  type FieldPilotDatabase,
  type OfflineEntity,
  type PendingOperation,
} from './database';

export class OfflineRepository<T extends OfflineEntity> {
  constructor(private readonly table: EntityTable<T, 'id'>) {}

  get(id: string) {
    return this.table.where('id').equals(id).first();
  }

  list(organizationId: string) {
    return this.table
      .where('organizationId')
      .equals(organizationId)
      .filter((record) => !record.tombstone)
      .toArray();
  }
}

export const workOrderRepository = new OfflineRepository(db.workOrders);
export const projectRepository = new OfflineRepository(db.projects);
export const siteRepository = new OfflineRepository(db.sites);
export const locationRepository = new OfflineRepository(db.locations);
export const formVersionRepository = new OfflineRepository(db.formVersions);
export const inspectionDraftRepository = new OfflineRepository(
  db.inspectionDrafts,
);
export const defectDraftRepository = new OfflineRepository(db.defectDrafts);

const priorities: Record<string, number> = {
  form_submission: 2,
  defect: 3,
  signature: 4,
  thumbnail: 5,
  photo: 6,
  video: 7,
  file: 7,
};

export function createPendingOperation(
  input: Omit<
    PendingOperation,
    | 'id'
    | 'state'
    | 'priority'
    | 'attempts'
    | 'clientCreatedAt'
    | 'nextAttemptAt'
  >,
): PendingOperation {
  return {
    ...input,
    id: crypto.randomUUID(),
    state: 'pending',
    priority: priorities[input.entityType] ?? 1,
    attempts: 0,
    clientCreatedAt: new Date().toISOString(),
    nextAttemptAt: null,
  };
}

export async function readyOperations(
  organizationId: string,
  limit = 100,
  now = new Date(),
  database: FieldPilotDatabase = db,
) {
  return (
    await database.pendingOperations
      .where('organizationId')
      .equals(organizationId)
      .filter(
        ({ state, nextAttemptAt }) =>
          state === 'pending' ||
          (state === 'retry_scheduled' &&
            Boolean(nextAttemptAt && nextAttemptAt <= now.toISOString())),
      )
      .toArray()
  )
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        left.clientCreatedAt.localeCompare(right.clientCreatedAt) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, limit);
}

export async function scheduleOperationRetry(
  id: string,
  errorCode: string,
  database: FieldPilotDatabase = db,
) {
  await database.transaction('rw', database.pendingOperations, async () => {
    const operation = await database.pendingOperations.get(id);
    if (!operation) throw new Error('Pending operation not found');
    const attempts = operation.attempts + 1;
    await database.pendingOperations.update(id, {
      attempts,
      state: 'retry_scheduled',
      lastErrorCode: errorCode,
      nextAttemptAt: new Date(
        Date.now() + Math.min(300_000, 1_000 * 2 ** (attempts - 1)),
      ).toISOString(),
    });
  });
}

export async function saveWorkOrderWithOperation(
  workOrder: OfflineEntity,
  operation: PendingOperation,
  database: FieldPilotDatabase = db,
) {
  if (
    workOrder.organizationId !== operation.organizationId ||
    workOrder.id !== operation.entityId
  ) {
    throw new Error('Entity and operation scope must match');
  }
  await database.transaction(
    'rw',
    database.workOrders,
    database.pendingOperations,
    async () => {
      await database.workOrders.put(workOrder);
      await database.pendingOperations.add(operation);
    },
  );
}
