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
