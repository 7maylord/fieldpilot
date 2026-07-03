import type { EntityTable } from 'dexie';
import { apiRequest } from '../api';
import { getCheckpoint } from './checkpoints';
import { db, type FieldPilotDatabase, type OfflineEntity } from './database';
import { readyOperations, scheduleOperationRetry } from './repositories';
import { acquireSyncLock, releaseSyncLock } from './sync-lock';

type PushResult = {
  operationId: string;
  status:
    'applied' | 'auto_merged' | 'conflict' | 'rejected' | 'already_applied';
  conflictId?: string;
  rejectionCode?: string;
  serverValue?: unknown;
};

type Change = {
  sequence: string;
  entityType: string;
  entityId: string;
  operationType: string;
  organizationId: string;
  version: number | null;
  payload: Record<string, unknown>;
  occurredAt: string;
};
type PullResponse = {
  changes: Change[];
  nextCheckpoint: string;
  hasMore: boolean;
};

export async function syncNow(
  organizationId: string,
  deviceId: string,
  owner = crypto.randomUUID(),
  database: FieldPilotDatabase = db,
) {
  if (!(await acquireSyncLock(owner, database))) return false;
  try {
    await push(organizationId, deviceId, database);
    await pull(organizationId, deviceId, database);
    return true;
  } finally {
    await releaseSyncLock(owner, database);
  }
}

async function push(
  organizationId: string,
  deviceId: string,
  database: FieldPilotDatabase,
) {
  const operations = await readyOperations(
    organizationId,
    100,
    new Date(),
    database,
  );
  if (!operations.length) return;
  await database.pendingOperations.bulkUpdate(
    operations.map(({ id }) => ({ key: id, changes: { state: 'uploading' } })),
  );
  try {
    const response = await apiRequest<{ results: PushResult[] }>('/sync/push', {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({
        organizationId,
        deviceId,
        operations: operations.map((operation) => ({
          operationId: operation.id,
          entityType: operation.entityType,
          entityId: operation.entityId,
          operationType: operation.action,
          baseVersion: operation.baseVersion,
          clientCreatedAt: operation.clientCreatedAt,
          payload: operation.payload,
        })),
      }),
    });
    await database.transaction(
      'rw',
      [
        database.pendingOperations,
        database.syncConflicts,
        database.projects,
        database.sites,
        database.locations,
        database.workOrders,
        database.formVersions,
        database.defectDrafts,
        database.referenceData,
      ],
      async () => {
        for (const result of response.results) {
          const operation = await database.pendingOperations.get(
            result.operationId,
          );
          if (!operation) continue;
          if (result.status === 'conflict') {
            await database.pendingOperations.update(operation.id, {
              state: 'conflict',
            });
            await database.syncConflicts.put({
              id: result.conflictId!,
              organizationId,
              entityType: operation.entityType,
              entityId: operation.entityId,
              localValue: operation.payload,
              serverValue: result.serverValue,
              createdAt: new Date().toISOString(),
            });
          } else {
            await database.pendingOperations.update(operation.id, {
              state: result.status === 'rejected' ? 'rejected' : 'applied',
              lastErrorCode: result.rejectionCode,
              nextAttemptAt: null,
            });
            if (result.status !== 'rejected')
              await entityTable(operation.entityType, database)?.update(
                operation.entityId,
                {
                  syncState: 'synced',
                  serverVersion: (operation.baseVersion ?? 0) + 1,
                  serverUpdatedAt: new Date().toISOString(),
                },
              );
          }
        }
      },
    );
  } catch (error) {
    for (const operation of operations)
      await scheduleOperationRetry(
        operation.id,
        'SYNC_REQUEST_FAILED',
        database,
      );
    throw error;
  }
}

async function pull(
  organizationId: string,
  deviceId: string,
  database: FieldPilotDatabase,
) {
  let checkpoint = await getCheckpoint(organizationId, database);
  if (!checkpoint) throw new Error('Sync bootstrap is required');
  let hasMore = true;
  while (hasMore) {
    const response: PullResponse = await apiRequest<PullResponse>(
      '/sync/pull',
      {
        method: 'POST',
        body: JSON.stringify({
          organizationId,
          deviceId,
          checkpoint,
          limit: 500,
        }),
      },
    );
    await importChanges(
      organizationId,
      response.changes,
      response.nextCheckpoint,
      database,
    );
    checkpoint = response.nextCheckpoint;
    hasMore = response.hasMore;
  }
}

async function importChanges(
  organizationId: string,
  changes: Change[],
  checkpoint: string,
  database: FieldPilotDatabase,
) {
  const tables = [
    database.projects,
    database.sites,
    database.locations,
    database.workOrders,
    database.formVersions,
    database.defectDrafts,
    database.referenceData,
  ];
  await database.transaction(
    'rw',
    [...tables, database.syncState, database.syncConflicts],
    async () => {
      for (const change of changes) {
        if (change.organizationId !== organizationId)
          throw new Error('Pulled change scope is invalid');
        const table = entityTable(change.entityType, database);
        if (!table) continue;
        const current = await table.get(change.entityId);
        if (
          current &&
          current.syncState !== 'synced' &&
          change.operationType !== 'conflict_resolution'
        ) {
          await database.syncConflicts.put({
            id: `pull:${change.sequence}`,
            organizationId,
            entityType: change.entityType,
            entityId: change.entityId,
            localValue: current,
            serverValue: change.payload,
            createdAt: change.occurredAt,
          });
          continue;
        }
        if (change.operationType === 'conflict_resolution')
          await database.syncConflicts
            .where('entityId')
            .equals(change.entityId)
            .delete();
        await table.put({
          ...(current ?? {}),
          ...change.payload,
          id: change.entityId,
          organizationId,
          serverVersion: change.version ?? current?.serverVersion ?? 0,
          localUpdatedAt: change.occurredAt,
          serverUpdatedAt: change.occurredAt,
          syncState: 'synced',
          tombstone: Boolean(change.payload.tombstone),
        });
      }
      await database.syncState.put({
        key: `checkpoint:${organizationId}`,
        value: checkpoint,
      });
    },
  );
}

function entityTable(
  entityType: string,
  database: FieldPilotDatabase,
): EntityTable<OfflineEntity, 'id'> | undefined {
  return {
    project: database.projects,
    site: database.sites,
    location: database.locations,
    work_order: database.workOrders,
    form_version: database.formVersions,
    defect: database.defectDrafts,
    asset: database.referenceData,
  }[entityType];
}
