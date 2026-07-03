import Dexie, { type EntityTable } from 'dexie';

export type SyncState = 'synced' | 'pending' | 'conflict';

export interface OfflineEntity {
  id: string;
  organizationId: string;
  serverVersion: number;
  localUpdatedAt: string;
  serverUpdatedAt: string | null;
  syncState: SyncState;
  tombstone: boolean;
  [key: string]: unknown;
}

export interface SyncStateRecord {
  key: string;
  value?: unknown;
  owner?: string;
  expiresAt?: number;
}

export interface DownloadManifest {
  id: string;
  organizationId: string;
  version: string;
  expiresAt: string;
  downloadedAt: string;
}

export interface PendingOperation {
  id: string;
  organizationId: string;
  entityType: string;
  entityId: string;
  action: string;
  baseVersion: number | null;
  payload: unknown;
  state:
    | 'pending'
    | 'uploading'
    | 'applied'
    | 'conflict'
    | 'rejected'
    | 'retry_scheduled'
    | 'failed_permanently';
  priority: number;
  attempts: number;
  clientCreatedAt: string;
  nextAttemptAt: string | null;
  lastErrorCode?: string;
}

export interface MediaRecord extends OfflineEntity {
  file?: Blob;
  sha256?: string;
  uploadState: 'local' | 'uploading' | 'uploaded' | 'failed';
}

export interface SyncConflict {
  id: string;
  organizationId: string;
  entityType: string;
  entityId: string;
  localValue: unknown;
  serverValue: unknown;
  createdAt: string;
}

export class FieldPilotDatabase extends Dexie {
  syncState!: EntityTable<SyncStateRecord, 'key'>;
  downloadManifests!: EntityTable<DownloadManifest, 'id'>;
  projects!: EntityTable<OfflineEntity, 'id'>;
  sites!: EntityTable<OfflineEntity, 'id'>;
  locations!: EntityTable<OfflineEntity, 'id'>;
  workOrders!: EntityTable<OfflineEntity, 'id'>;
  formVersions!: EntityTable<OfflineEntity, 'id'>;
  inspectionDrafts!: EntityTable<OfflineEntity, 'id'>;
  defectDrafts!: EntityTable<OfflineEntity, 'id'>;
  mediaRecords!: EntityTable<MediaRecord, 'id'>;
  pendingOperations!: EntityTable<PendingOperation, 'id'>;
  syncConflicts!: EntityTable<SyncConflict, 'id'>;
  cachedDocuments!: EntityTable<OfflineEntity, 'id'>;
  referenceData!: EntityTable<OfflineEntity, 'id'>;

  constructor(name = 'fieldpilot') {
    super(name);
    this.version(1).stores({
      syncState: 'key',
      downloadManifests: 'id, organizationId, expiresAt',
      projects: 'id, organizationId, syncState, tombstone',
      sites: 'id, organizationId, syncState, tombstone',
      locations: 'id, organizationId, syncState, tombstone',
      workOrders: 'id, organizationId, syncState, tombstone',
      formVersions: 'id, organizationId, syncState, tombstone',
      inspectionDrafts: 'id, organizationId, syncState, tombstone',
      defectDrafts: 'id, organizationId, syncState, tombstone',
      mediaRecords: 'id, organizationId, syncState, uploadState',
      pendingOperations:
        'id, organizationId, entityId, state, priority, createdAt',
      syncConflicts: 'id, organizationId, entityId, createdAt',
      cachedDocuments: 'id, organizationId, syncState, tombstone',
      referenceData: 'id, organizationId, syncState, tombstone',
    });
    this.version(2)
      .stores({
        pendingOperations:
          'id, organizationId, [organizationId+state], entityId, state, priority, createdAt',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<PendingOperation>('pendingOperations')
          .toCollection()
          .modify((operation) => {
            operation.attempts ??= 0;
            operation.priority ??= 0;
          });
      });
    this.version(3)
      .stores({
        pendingOperations:
          'id, organizationId, [organizationId+state], entityId, state, priority, clientCreatedAt',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<PendingOperation & { createdAt?: string }>('pendingOperations')
          .toCollection()
          .modify((operation) => {
            operation.clientCreatedAt ??=
              operation.createdAt ?? new Date().toISOString();
            operation.nextAttemptAt ??= null;
            if (operation.state === ('sending' as PendingOperation['state']))
              operation.state = 'pending';
            delete operation.createdAt;
          });
      });
  }
}

export const db = new FieldPilotDatabase();
