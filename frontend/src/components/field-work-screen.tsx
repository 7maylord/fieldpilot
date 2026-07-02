'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { db, type OfflineEntity } from '../lib/offline/database';
import { workOrderRepository } from '../lib/offline/repositories';

type Assignment = { assigneeType: string; assigneeId: string };
type WorkOrder = OfflineEntity & {
  title: string;
  status: string;
  priority: string;
  workType: string;
  version: number;
  dueAt?: string | null;
  plannedStart?: string | null;
  assignments: Assignment[];
};
type FieldContext = { organizationId: string; userId: string };

async function refreshRepository(): Promise<FieldContext> {
  const [user, organizations] = await Promise.all([
    apiRequest<{ id: string }>('/auth/me'),
    apiRequest<{ id: string }[]>('/organizations'),
  ]);
  const organization = organizations[0];
  if (!organization) throw new Error('No organization available');
  const projects = await apiRequest<{ id: string }[]>(
    `/organizations/${organization.id}/projects`,
  );
  const batches = await Promise.all(
    projects.map((project) =>
      apiRequest<WorkOrder[]>(
        `/organizations/${organization.id}/work-orders?projectId=${project.id}`,
      ),
    ),
  );
  const now = new Date().toISOString();
  await db.transaction('rw', db.workOrders, db.syncState, async () => {
    await db.workOrders.bulkPut(
      batches.flat().map((item) => ({
        ...item,
        organizationId: organization.id,
        serverVersion: item.version,
        localUpdatedAt: now,
        serverUpdatedAt: now,
        syncState: 'synced',
        tombstone: false,
      })),
    );
    await db.syncState.put({
      key: 'field-context',
      value: { organizationId: organization.id, userId: user.id },
    });
  });
  return { organizationId: organization.id, userId: user.id };
}

async function localContext() {
  return (await db.syncState.get('field-context'))?.value as
    FieldContext | undefined;
}

export function FieldWorkScreen({ view }: { view: 'today' | 'mine' }) {
  const [items, setItems] = useState<WorkOrder[]>([]);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>();
  const [opened, setOpened] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const showLocal = async (context?: FieldContext) => {
      if (!context) {
        setItems([]);
        return;
      }
      const stored = (
        await workOrderRepository.list(context.organizationId)
      ).map((item) => item as OfflineEntity & WorkOrder);
      const today = new Date().toISOString().slice(0, 10);
      const visible =
        view === 'mine'
          ? stored.filter((item) =>
              item.assignments?.some(
                (assignment) =>
                  assignment.assigneeType === 'user' &&
                  assignment.assigneeId === context.userId,
              ),
            )
          : stored.filter(
              (item) =>
                [item.dueAt, item.plannedStart].some(
                  (date) => date?.slice(0, 10) === today,
                ) && !['completed', 'cancelled'].includes(item.status),
            );
      setItems(visible);
      setSelected((current) => current ?? visible[0]?.id);
    };
    try {
      await showLocal(await localContext());
    } catch {
      setItems([]);
      setOffline(true);
    } finally {
      setLoading(false);
    }
    if (!navigator.onLine) {
      setOffline(true);
      return;
    }
    try {
      await showLocal(await refreshRepository());
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [view]);

  useEffect(() => {
    void load();
    const reconnect = () => void load();
    window.addEventListener('online', reconnect);
    window.addEventListener('offline', reconnect);
    return () => {
      window.removeEventListener('online', reconnect);
      window.removeEventListener('offline', reconnect);
    };
  }, [load]);
  const current = items.find((item) => item.id === selected);

  return (
    <>
      <section className="field-heading">
        <div>
          <p className="eyebrow">
            {offline ? 'Available offline' : 'Repository refreshed'}
          </p>
          <h1>{view === 'today' ? 'Today' : 'My Work'}</h1>
          <p>
            {view === 'today'
              ? 'Work planned or due today.'
              : 'Work assigned directly to you.'}
          </p>
        </div>
        <button type="button" className="secondary" onClick={() => void load()}>
          Refresh
        </button>
      </section>
      <div className="field-work-grid">
        <section className="panel">
          <h2>{items.length} work orders</h2>
          {loading ? (
            <p aria-live="polite">Loading downloaded work…</p>
          ) : items.length ? (
            <ul className="field-work-list">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={selected === item.id ? 'selected' : ''}
                    onClick={() => setSelected(item.id)}
                  >
                    <span className={`priority ${item.priority}`}>
                      {item.priority}
                    </span>
                    <strong>{item.title}</strong>
                    <small>
                      {item.workType} · {item.status.replaceAll('_', ' ')}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state">
              <strong>
                {offline
                  ? 'No downloaded work matches this view'
                  : 'Nothing scheduled here'}
              </strong>
              <span>
                {offline
                  ? 'Reconnect to refresh your package.'
                  : 'You are clear for now.'}
              </span>
            </div>
          )}
        </section>
        <aside className="panel field-detail">
          <h2>Work details</h2>
          {current ? (
            <>
              <span className="status-pill">
                {current.status.replaceAll('_', ' ')}
              </span>
              <h3>{current.title}</h3>
              <dl>
                <div>
                  <dt>Priority</dt>
                  <dd>{current.priority}</dd>
                </div>
                <div>
                  <dt>Type</dt>
                  <dd>{current.workType}</dd>
                </div>
                <div>
                  <dt>Due</dt>
                  <dd>
                    {current.dueAt
                      ? new Date(current.dueAt).toLocaleString()
                      : 'Not set'}
                  </dd>
                </div>
              </dl>
              <button
                className="primary"
                type="button"
                onClick={() => setOpened(true)}
              >
                Open work order
              </button>
              {opened && (
                <p role="status">
                  Work-order details opened from the local repository.
                </p>
              )}
            </>
          ) : (
            <p>Select a work order to see its details.</p>
          )}
        </aside>
      </div>
    </>
  );
}
