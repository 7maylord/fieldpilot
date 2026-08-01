'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { formatTimestamp } from '../lib/format-date';
import { db, type OfflineEntity } from '../lib/offline/database';
import { workOrderRepository } from '../lib/offline/repositories';

type Assignment = { assigneeType: string; assigneeId: string };
type Project = OfflineEntity & { code: string; name: string };
type Site = OfflineEntity & {
  projectId: string;
  code: string;
  name: string;
  status: string;
};
type FormVersion = OfflineEntity & {
  templateName?: string;
  versionNumber?: number;
  schema?: { title?: string };
};
type FormTemplate = {
  name: string;
  versions: Array<{
    id: string;
    status: string;
    versionNumber: number;
    schema?: { title?: string };
  }>;
};
type Team = { id: string; name: string };
type WorkOrder = OfflineEntity & {
  projectId: string;
  siteId?: string | null;
  checklistId?: string | null;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  workType: string;
  version: number;
  dueAt?: string | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  estimatedMinutes?: number | null;
  requiredSkills?: string[];
  evidenceRequirements?: string[];
  assignments: Assignment[];
};
type FieldContext = {
  organizationId: string;
  userId: string;
  teamIds?: string[];
};
type Lookups = {
  projects: Map<string, Project>;
  sites: Map<string, Site>;
  forms: Map<string, FormVersion>;
};

async function refreshRepository(): Promise<FieldContext> {
  const [user, organizations] = await Promise.all([
    apiRequest<{ id: string }>('/auth/me'),
    apiRequest<{ id: string }[]>('/organizations'),
  ]);
  const organization = organizations[0];
  if (!organization) throw new Error('No organization available');
  const [projects, templates, teams] = await Promise.all([
    apiRequest<Project[]>(`/organizations/${organization.id}/projects`),
    apiRequest<FormTemplate[]>(
      `/organizations/${organization.id}/form-templates`,
    ).catch(() => []),
    apiRequest<Team[]>(`/organizations/${organization.id}/my-teams`).catch(
      () => [],
    ),
  ]);
  const [batches, siteBatches] = await Promise.all([
    Promise.all(
      projects.map((project) =>
        apiRequest<WorkOrder[]>(
          `/organizations/${organization.id}/work-orders?projectId=${project.id}`,
        ),
      ),
    ),
    Promise.all(
      projects.map((project) =>
        apiRequest<Site[]>(
          `/organizations/${organization.id}/projects/${project.id}/sites`,
        ).catch(() => []),
      ),
    ),
  ]);
  const formVersions = templates.flatMap((template) =>
    template.versions
      .filter((version) => version.status === 'published')
      .map((version) => ({ ...version, templateName: template.name })),
  );
  const now = new Date().toISOString();
  await db.transaction(
    'rw',
    db.projects,
    db.sites,
    db.workOrders,
    db.formVersions,
    db.syncState,
    async () => {
      await Promise.all([
        db.projects.bulkPut(toOffline(organization.id, projects, now)),
        db.sites.bulkPut(toOffline(organization.id, siteBatches.flat(), now)),
        db.workOrders.bulkPut(toOffline(organization.id, batches.flat(), now)),
        db.formVersions.bulkPut(toOffline(organization.id, formVersions, now)),
        db.syncState.put({
          key: 'field-context',
          value: {
            organizationId: organization.id,
            userId: user.id,
            teamIds: teams.map(({ id }) => id),
          },
        }),
      ]);
    },
  );
  return {
    organizationId: organization.id,
    userId: user.id,
    teamIds: teams.map(({ id }) => id),
  };
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
  const [lookups, setLookups] = useState<Lookups>({
    projects: new Map(),
    sites: new Map(),
    forms: new Map(),
  });

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
      const [projects, sites, forms] = await Promise.all([
        db.projects
          .where('organizationId')
          .equals(context.organizationId)
          .toArray(),
        db.sites
          .where('organizationId')
          .equals(context.organizationId)
          .toArray(),
        db.formVersions
          .where('organizationId')
          .equals(context.organizationId)
          .toArray(),
      ]);
      setLookups({
        projects: new Map(
          projects.map((project) => [project.id, project as Project]),
        ),
        sites: new Map(sites.map((site) => [site.id, site as Site])),
        forms: new Map(forms.map((form) => [form.id, form as FormVersion])),
      });
      const today = new Date().toISOString().slice(0, 10);
      const teamIds = new Set(context.teamIds ?? []);
      const visible =
        view === 'mine'
          ? stored.filter((item) =>
              item.assignments?.some(
                (assignment) =>
                  (assignment.assigneeType === 'user' &&
                    assignment.assigneeId === context.userId) ||
                  (assignment.assigneeType === 'team' &&
                    teamIds.has(assignment.assigneeId)),
              ),
            )
          : stored.filter(
              (item) =>
                [item.dueAt, item.plannedStart].some(
                  (date) => date?.slice(0, 10) === today,
                ) && !['completed', 'cancelled'].includes(item.status),
            );
      setItems(visible);
      setSelected((current) =>
        visible.some((item) => item.id === current) ? current : visible[0]?.id,
      );
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
  const currentProject = current
    ? lookups.projects.get(current.projectId)
    : undefined;
  const currentSite = current?.siteId
    ? lookups.sites.get(current.siteId)
    : undefined;
  const currentForm = current?.checklistId
    ? lookups.forms.get(current.checklistId)
    : undefined;

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
              : 'Downloaded work assigned to you or one of your teams.'}
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
              {current.description && <p>{current.description}</p>}
              <dl>
                <div>
                  <dt>Project</dt>
                  <dd>
                    {currentProject
                      ? `${currentProject.code} · ${currentProject.name}`
                      : current.projectId}
                  </dd>
                </div>
                <div>
                  <dt>Site</dt>
                  <dd>
                    {currentSite
                      ? `${currentSite.code} · ${currentSite.name}`
                      : current.siteId || 'Not set'}
                  </dd>
                </div>
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
                    {current.dueAt ? formatTimestamp(current.dueAt) : 'Not set'}
                  </dd>
                </div>
                <div>
                  <dt>Window</dt>
                  <dd>
                    {current.plannedStart
                      ? `${formatTimestamp(current.plannedStart)} → ${
                          current.plannedEnd
                            ? formatTimestamp(current.plannedEnd)
                            : 'open'
                        }`
                      : 'Not scheduled'}
                  </dd>
                </div>
                <div>
                  <dt>Checklist</dt>
                  <dd>
                    {currentForm
                      ? `${currentForm.templateName ?? currentForm.schema?.title ?? 'Form'} v${
                          currentForm.versionNumber ?? 1
                        }`
                      : current.checklistId
                        ? 'Checklist unavailable offline'
                        : 'No checklist attached'}
                  </dd>
                </div>
              </dl>
              <div className="detail-stack">
                <DetailList
                  title="Assignments"
                  empty="Not assigned yet"
                  items={(current.assignments ?? []).map(
                    (assignment) =>
                      `${assignment.assigneeType}: ${assignment.assigneeId}`,
                  )}
                />
                <DetailList
                  title="Evidence required"
                  empty="No evidence required"
                  items={current.evidenceRequirements ?? []}
                />
                <DetailList
                  title="Skills"
                  empty="No skills listed"
                  items={current.requiredSkills ?? []}
                />
              </div>
            </>
          ) : (
            <p>Select a work order to see its details.</p>
          )}
        </aside>
      </div>
    </>
  );
}

function DetailList({
  title,
  items,
  empty,
}: {
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <section>
      <strong>{title}</strong>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>{empty}</p>
      )}
    </section>
  );
}

function toOffline(
  organizationId: string,
  rows: Array<Record<string, unknown> & { id: string; version?: number }>,
  now: string,
): OfflineEntity[] {
  return rows.map((row) => ({
    ...row,
    organizationId,
    serverVersion: Number(row.version ?? 1),
    localUpdatedAt: String(row.updatedAt ?? now),
    serverUpdatedAt: String(row.updatedAt ?? now),
    syncState: 'synced',
    tombstone: false,
  }));
}
