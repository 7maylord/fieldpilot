'use client';

import { useEffect, useState } from 'react';
import { db } from '../lib/offline/database';
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
const initialStatus: Status = {
  pending: 0,
  media: 0,
  conflicts: 0,
  packageVersion: null,
};

export function OfflineStatus({
  organizationId = 'horizon',
}: {
  organizationId?: string;
}) {
  const [online, setOnline] = useState(true);
  const [status, setStatus] = useState(initialStatus);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const refresh = async () => {
      setOnline(navigator.onLine);
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
    try {
      const version = new Date().toISOString().slice(0, 10);
      await db.downloadManifests.put({
        id: `${organizationId}:${version}`,
        organizationId,
        version,
        downloadedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      });
      setStatus((current) => ({ ...current, packageVersion: version }));
      setMessage('Offline package downloaded.');
    } catch (error) {
      setMessage(`Offline package failed: ${String(error)}`);
    }
  }

  return (
    <section className="offline-status" aria-label="Offline work status">
      <span className={online ? 'healthy' : 'warning'}>
        {online ? 'Online' : 'Offline'}
      </span>
      <span>Package: {status.packageVersion ?? 'not downloaded'}</span>
      {!status.packageVersion && (
        <button type="button" onClick={downloadPackage}>
          Download package
        </button>
      )}
      <span>Pending: {status.pending}</span>
      <span>Media: {status.media}</span>
      <span>Conflicts: {status.conflicts}</span>
      <button type="button" onClick={exportRecovery}>
        Export recovery data
      </button>
      {message && <span role="status">{message}</span>}
    </section>
  );
}
