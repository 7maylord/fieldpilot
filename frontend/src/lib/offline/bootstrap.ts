import type { EntityTable } from 'dexie';
import { apiRequest } from '../api';
import { db, type FieldPilotDatabase, type OfflineEntity } from './database';
import { getCheckpoint } from './checkpoints';

type ServerEntity = {
  id: string;
  organizationId: string;
  version: number;
  updatedAt?: string;
  [key: string]: unknown;
};

export interface BootstrapPackage {
  checkpoint: string;
  serverTime: string;
  packageExpiresAt: string;
  projects: ServerEntity[];
  sites: ServerEntity[];
  locations: ServerEntity[];
  workOrders: ServerEntity[];
  formVersions: ServerEntity[];
  inspections?: ServerEntity[];
  referenceData: ServerEntity[];
}

export async function downloadBootstrap(
  organizationId: string,
  deviceId: string,
  projectIds: string[],
  database: FieldPilotDatabase = db,
) {
  const snapshot = await apiRequest<BootstrapPackage>('/sync/bootstrap', {
    method: 'POST',
    body: JSON.stringify({
      organizationId,
      deviceId,
      projectIds,
      lastCheckpoint: await getCheckpoint(organizationId, database),
    }),
  });
  await importBootstrap(organizationId, snapshot, database);
  return snapshot;
}

export async function importBootstrap(
  organizationId: string,
  snapshot: BootstrapPackage,
  database: FieldPilotDatabase = db,
) {
  const collections = [
    [database.projects, snapshot.projects],
    [database.sites, snapshot.sites],
    [database.locations, snapshot.locations],
    [database.workOrders, snapshot.workOrders],
    [database.formVersions, snapshot.formVersions],
    [database.inspectionDrafts, snapshot.inspections ?? []],
    [database.referenceData, snapshot.referenceData],
  ] as const;
  if (
    !snapshot.checkpoint ||
    collections.some(([, records]) =>
      records.some(
        ({ id, organizationId: recordOrganizationId }) =>
          !id || recordOrganizationId !== organizationId,
      ),
    )
  )
    throw new Error('Bootstrap package scope is invalid');

  await database.transaction(
    'rw',
    [
      ...collections.map(([table]) => table),
      database.downloadManifests,
      database.syncState,
    ],
    async () => {
      for (const [table, records] of collections)
        await replaceSynced(
          table,
          organizationId,
          records,
          snapshot.serverTime,
        );
      await database.downloadManifests.put({
        id: `${organizationId}:${snapshot.checkpoint}`,
        organizationId,
        version: snapshot.checkpoint,
        expiresAt: snapshot.packageExpiresAt,
        downloadedAt: new Date().toISOString(),
      });
      await database.syncState.put({
        key: `checkpoint:${organizationId}`,
        value: snapshot.checkpoint,
      });
    },
  );
}

async function replaceSynced(
  table: EntityTable<OfflineEntity, 'id'>,
  organizationId: string,
  records: ServerEntity[],
  serverTime: string,
) {
  await table
    .where('organizationId')
    .equals(organizationId)
    .filter(({ syncState }) => syncState === 'synced')
    .delete();
  const localIds = new Set(
    (
      await table
        .where('organizationId')
        .equals(organizationId)
        .filter(({ syncState }) => syncState !== 'synced')
        .primaryKeys()
    ).map(String),
  );
  await table.bulkPut(
    records
      .filter(({ id }) => !localIds.has(id))
      .map((record) => ({
        ...record,
        serverVersion: record.version,
        localUpdatedAt: serverTime,
        serverUpdatedAt: record.updatedAt ?? serverTime,
        syncState: 'synced' as const,
        tombstone: false,
      })),
  );
}
