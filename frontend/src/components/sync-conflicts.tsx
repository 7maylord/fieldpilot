'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

type Conflict = {
  id: string;
  entityType: string;
  entityId: string;
  operationType: string;
  localValue: unknown;
  serverValue: unknown;
};

export function SyncConflicts({
  organizationSlug,
}: {
  organizationSlug: string;
}) {
  const [organizationId, setOrganizationId] = useState('');
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const organizations =
      await apiRequest<{ id: string; slug: string }[]>('/organizations');
    const organization = organizations.find(
      ({ slug }) => slug === organizationSlug,
    );
    if (!organization) throw new Error('Organization not found');
    setOrganizationId(organization.id);
    setConflicts(
      await apiRequest<Conflict[]>(
        `/sync/conflicts?organizationId=${organization.id}`,
      ),
    );
  }, [organizationSlug]);

  useEffect(() => {
    void load().catch(() => setMessage('Unable to load sync conflicts.'));
  }, [load]);

  async function resolve(conflictId: string, choice: 'local' | 'server') {
    await apiRequest(`/sync/conflicts/${conflictId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ organizationId, resolution: { choice } }),
    });
    setConflicts((current) => current.filter(({ id }) => id !== conflictId));
    setMessage('Conflict resolved and recorded in audit history.');
  }

  return (
    <section className="panel" aria-labelledby="sync-conflicts-title">
      <h2 id="sync-conflicts-title">Sync conflicts</h2>
      {conflicts.length === 0 ? (
        <p>No unresolved conflicts.</p>
      ) : (
        <ul className="conflict-list">
          {conflicts.map((conflict) => (
            <li key={conflict.id}>
              <strong>{conflict.entityType.replaceAll('_', ' ')}</strong>
              <span>{conflict.operationType.replaceAll('_', ' ')}</span>
              <details>
                <summary>Compare values</summary>
                <pre>
                  {JSON.stringify(
                    {
                      local: conflict.localValue,
                      server: conflict.serverValue,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
              <div className="actions">
                <button
                  type="button"
                  onClick={() => void resolve(conflict.id, 'server')}
                >
                  Keep server
                </button>
                <button
                  type="button"
                  onClick={() => void resolve(conflict.id, 'local')}
                >
                  Keep field update
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
