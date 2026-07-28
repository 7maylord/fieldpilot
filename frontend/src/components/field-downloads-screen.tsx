'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { db } from '../lib/offline/database';

type Organization = { id: string; name: string; slug: string };
type PackageSummary = {
  organization?: Organization;
  packageVersion?: string;
  expiresAt?: string;
  projects: number;
  sites: number;
  locations: number;
  workOrders: number;
  formVersions: number;
  inspections: number;
  referenceData: number;
  pending: number;
  media: number;
  conflicts: number;
};

const emptySummary: PackageSummary = {
  projects: 0,
  sites: 0,
  locations: 0,
  workOrders: 0,
  formVersions: 0,
  inspections: 0,
  referenceData: 0,
  pending: 0,
  media: 0,
  conflicts: 0,
};

export function FieldDownloadsScreen() {
  const [summary, setSummary] = useState<PackageSummary>(emptySummary);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setMessage('');
    const organizations = await apiRequest<Organization[]>('/organizations');
    const organization = organizations[0];
    if (!organization) {
      setSummary(emptySummary);
      setMessage('Join or create an organization before downloading work.');
      return;
    }
    const manifest = await db.downloadManifests
      .where('organizationId')
      .equals(organization.id)
      .last();
    const [
      projects,
      sites,
      locations,
      workOrders,
      formVersions,
      inspections,
      referenceData,
      pending,
      media,
      conflicts,
    ] = await Promise.all([
      db.projects.where('organizationId').equals(organization.id).count(),
      db.sites.where('organizationId').equals(organization.id).count(),
      db.locations.where('organizationId').equals(organization.id).count(),
      db.workOrders.where('organizationId').equals(organization.id).count(),
      db.formVersions.where('organizationId').equals(organization.id).count(),
      db.inspectionDrafts.where('organizationId').equals(organization.id).count(),
      db.referenceData.where('organizationId').equals(organization.id).count(),
      db.pendingOperations
        .where('[organizationId+state]')
        .equals([organization.id, 'pending'])
        .count(),
      db.mediaRecords
        .where('organizationId')
        .equals(organization.id)
        .filter((record) => record.uploadState !== 'uploaded')
        .count(),
      db.syncConflicts.where('organizationId').equals(organization.id).count(),
    ]);
    setSummary({
      organization,
      packageVersion: manifest?.version,
      expiresAt: manifest?.expiresAt,
      projects,
      sites,
      locations,
      workOrders,
      formVersions,
      inspections,
      referenceData,
      pending,
      media,
      conflicts,
    });
  }, []);

  useEffect(() => {
    void load().catch(() => setMessage('Unable to read downloaded package.'));
  }, [load]);

  return (
    <>
      <section className="field-heading">
        <div>
          <p className="eyebrow">Offline vault</p>
          <h1>Downloads</h1>
          <p>
            Browse what is actually stored on this device for field work. Use
            Download package in the status strip to refresh it.
          </p>
        </div>
        <button className="secondary" type="button" onClick={() => void load()}>
          Refresh inventory
        </button>
      </section>
      <div className="dashboard-grid">
        <section className="panel">
          <h2>{summary.organization?.name ?? 'No workspace selected'}</h2>
          <dl>
            <div>
              <dt>Package</dt>
              <dd>{summary.packageVersion ?? 'not downloaded'}</dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>
                {summary.expiresAt
                  ? new Date(summary.expiresAt).toLocaleString()
                  : 'Not set'}
              </dd>
            </div>
            <div>
              <dt>Pending sync</dt>
              <dd>{summary.pending}</dd>
            </div>
            <div>
              <dt>Media waiting</dt>
              <dd>{summary.media}</dd>
            </div>
            <div>
              <dt>Conflicts</dt>
              <dd>{summary.conflicts}</dd>
            </div>
          </dl>
        </section>
        <section className="panel">
          <h2>Stored data</h2>
          <ul className="download-inventory">
            <li>
              <strong>{summary.projects}</strong>
              <span>Projects</span>
            </li>
            <li>
              <strong>{summary.sites}</strong>
              <span>Sites</span>
            </li>
            <li>
              <strong>{summary.locations}</strong>
              <span>Locations</span>
            </li>
            <li>
              <strong>{summary.workOrders}</strong>
              <span>Work orders</span>
            </li>
            <li>
              <strong>{summary.formVersions}</strong>
              <span>Forms/checklists</span>
            </li>
            <li>
              <strong>{summary.inspections}</strong>
              <span>Inspections</span>
            </li>
            <li>
              <strong>{summary.referenceData}</strong>
              <span>Assets/reference</span>
            </li>
          </ul>
        </section>
      </div>
      {message && (
        <p className="field-error" role="status">
          {message}
        </p>
      )}
    </>
  );
}
