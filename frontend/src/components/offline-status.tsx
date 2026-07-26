'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { db, type OfflineEntity } from '../lib/offline/database';
import {
  createRecoveryExport,
  relieveStoragePressure,
} from '../lib/offline/recovery';

type Status = {
  pending: number;
  media: number;
  conflicts: number;
  packageVersion: string | null;
};
type Project = { id: string };
type Bootstrap = {
  checkpoint: string;
  serverTime: string;
  packageExpiresAt: string;
  projects: Record<string, unknown>[];
  sites: Record<string, unknown>[];
  locations: Record<string, unknown>[];
  workOrders: Record<string, unknown>[];
  formVersions: Record<string, unknown>[];
  inspections: Record<string, unknown>[];
  assets: Record<string, unknown>[];
  referenceData: Record<string, unknown>[];
};

const initialStatus: Status = {
  pending: 0,
  media: 0,
  conflicts: 0,
  packageVersion: null,
};

export function OfflineStatus({ organizationId }: { organizationId?: string }) {
  const [online, setOnline] = useState(true);
  const [status, setStatus] = useState(initialStatus);
  const [message, setMessage] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const refresh = async () => {
      setOnline(navigator.onLine);
      if (!organizationId) {
        setStatus(initialStatus);
        return;
      }
      const [pending, media, conflicts, manifest] = await Promise.all([
        db.pendingOperations
          .where('[organizationId+state]')
          .equals([organizationId, 'pending'])
          .count(),
        db.mediaRecords
          .where('organizationId')
          .equals(organizationId)
          .filter((record) => record.uploadState !== 'uploaded')
          .count(),
        db.syncConflicts.where('organizationId').equals(organizationId).count(),
        db.downloadManifests
          .where('organizationId')
          .equals(organizationId)
          .last(),
      ]);
      setStatus({
        pending,
        media,
        conflicts,
        packageVersion: manifest?.version ?? null,
      });
      if (await relieveStoragePressure())
        setMessage('Storage pressure reduced without removing unsynced work.');
    };
    const connectivity = () => void refresh();
    window.addEventListener('online', connectivity);
    window.addEventListener('offline', connectivity);
    void refresh();
    return () => {
      window.removeEventListener('online', connectivity);
      window.removeEventListener('offline', connectivity);
    };
  }, [organizationId]);

  async function exportRecovery() {
    if (!organizationId) return;
    const blob = await createRecoveryExport(organizationId);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `fieldpilot-recovery-${organizationId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage('Recovery export created.');
  }

  async function downloadPackage() {
    if (!organizationId) return;
    setDownloading(true);
    setMessage('Downloading offline package…');
    try {
      const projects = await apiRequest<Project[]>(
        `/organizations/${organizationId}/projects`,
      );
      if (!projects.length) {
        setMessage('Create a project before downloading an offline package.');
        return;
      }
      const deviceId = await ensureDevice(organizationId);
      const checkpoint = await db.syncState.get(`checkpoint:${organizationId}`);
      const bootstrap = await apiRequest<Bootstrap>('/sync/bootstrap', {
        method: 'POST',
        body: JSON.stringify({
          deviceId,
          organizationId,
          projectIds: projects.map(({ id }) => id),
          lastCheckpoint:
            typeof checkpoint?.value === 'string' ? checkpoint.value : null,
        }),
      });
      await saveBootstrap(organizationId, bootstrap);
      setStatus((current) => ({
        ...current,
        packageVersion: packageVersion(bootstrap.serverTime),
      }));
      setMessage('Offline package downloaded.');
    } catch (error) {
      setMessage(`Offline package failed: ${String(error)}`);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="offline-status" aria-label="Offline work status">
      <span className={online ? 'healthy' : 'warning'}>
        {online ? 'Online' : 'Offline'}
      </span>
      <span>Package: {status.packageVersion ?? 'not downloaded'}</span>
      {organizationId && (
        <button type="button" onClick={downloadPackage} disabled={downloading}>
          {downloading ? 'Downloading…' : 'Download package'}
        </button>
      )}
      <span>Pending: {status.pending}</span>
      <span>Media: {status.media}</span>
      <span>Conflicts: {status.conflicts}</span>
      <button type="button" onClick={exportRecovery} disabled={!organizationId}>
        Export recovery data
      </button>
      {message && <span role="status">{message}</span>}
    </section>
  );
}

async function ensureDevice(organizationId: string) {
  const key = `fieldpilot:device:${organizationId}`;
  const existingId = localStorage.getItem(key);
  const devices = await apiRequest<{ id: string }[]>(
    `/organizations/${organizationId}/devices`,
  );
  if (existingId && devices.some(({ id }) => id === existingId))
    return existingId;
  const deviceId = crypto.randomUUID();
  await apiRequest(`/organizations/${organizationId}/devices`, {
    method: 'POST',
    body: JSON.stringify({
      deviceId,
      name: navigator.userAgent.slice(0, 120) || 'Web browser',
      platform: 'web',
      appVersion: '1.0.0',
    }),
  });
  localStorage.setItem(key, deviceId);
  return deviceId;
}

async function saveBootstrap(organizationId: string, bootstrap: Bootstrap) {
  const version = packageVersion(bootstrap.serverTime);
  await db.transaction(
    'rw',
    [
      db.syncState,
      db.downloadManifests,
      db.projects,
      db.sites,
      db.locations,
      db.workOrders,
      db.formVersions,
      db.inspectionDrafts,
      db.referenceData,
    ],
    async () => {
      await Promise.all([
        db.projects.bulkPut(toOffline(organizationId, bootstrap.projects)),
        db.sites.bulkPut(toOffline(organizationId, bootstrap.sites)),
        db.locations.bulkPut(toOffline(organizationId, bootstrap.locations)),
        db.workOrders.bulkPut(toOffline(organizationId, bootstrap.workOrders)),
        db.formVersions.bulkPut(
          toOffline(organizationId, bootstrap.formVersions),
        ),
        db.inspectionDrafts.bulkPut(
          toOffline(organizationId, bootstrap.inspections).map(
            (inspection) => ({
              ...inspection,
              answers: inspection.draftAnswers ?? {},
              draftAnswers: inspection.draftAnswers ?? {},
            }),
          ),
        ),
        db.referenceData.bulkPut(
          toOffline(organizationId, [
            ...bootstrap.assets,
            ...bootstrap.referenceData,
          ]),
        ),
        db.syncState.put({
          key: `checkpoint:${organizationId}`,
          value: bootstrap.checkpoint,
        }),
        db.downloadManifests.put({
          id: `${organizationId}:${version}`,
          organizationId,
          version,
          downloadedAt: String(bootstrap.serverTime),
          expiresAt: String(bootstrap.packageExpiresAt),
        }),
      ]);
    },
  );
}

function toOffline(
  organizationId: string,
  rows: Record<string, unknown>[],
): OfflineEntity[] {
  const now = new Date().toISOString();
  return rows
    .filter((row) => row.id)
    .map((row) => ({
      ...row,
      id: String(row.id),
      organizationId,
      serverVersion: Number(row.version ?? 1),
      localUpdatedAt: String(row.updatedAt ?? now),
      serverUpdatedAt: String(row.updatedAt ?? now),
      syncState: 'synced',
      tombstone: false,
    }));
}

function packageVersion(serverTime: string) {
  return new Date(serverTime).toISOString().slice(0, 10);
}
