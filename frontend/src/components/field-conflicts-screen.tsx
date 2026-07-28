'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { SyncConflicts } from './sync-conflicts';

type Organization = { id: string; name: string; slug: string };

export function FieldConflictsScreen() {
  const [organization, setOrganization] = useState<Organization>();
  const [message, setMessage] = useState('');

  useEffect(() => {
    apiRequest<Organization[]>('/organizations')
      .then((organizations) => {
        setOrganization(organizations[0]);
        if (!organizations[0])
          setMessage('Join or create an organization before resolving sync.');
      })
      .catch(() => setMessage('Unable to load sync workspace.'));
  }, []);

  return (
    <>
      <section className="field-heading">
        <div>
          <p className="eyebrow">Sync review</p>
          <h1>Conflicts</h1>
          <p>
            Compare field updates with server records and choose which version
            wins.
          </p>
        </div>
      </section>
      {organization ? (
        <SyncConflicts organizationSlug={organization.slug} />
      ) : (
        <section className="panel">
          <p>{message || 'Loading conflicts…'}</p>
        </section>
      )}
    </>
  );
}
