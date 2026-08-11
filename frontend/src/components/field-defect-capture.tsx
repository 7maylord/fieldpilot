'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { apiRequest } from '../lib/api';
import { severities, severityLabel } from '../lib/defect-status';
import { formatTimestamp } from '../lib/format-date';
import {
  db,
  type OfflineEntity,
  type PendingOperation,
} from '../lib/offline/database';
import {
  createPendingOperation,
  defectDraftRepository,
} from '../lib/offline/repositories';
import { MediaCapture } from './media-capture';

export type DefectCaptureInput = {
  projectId: string;
  category: string;
  severity: string;
  title: string;
  description?: string;
  inspectionId?: string;
  locationId?: string;
};

export function defectSeedFromItem(
  item: { id: string; label: string },
  context: { projectId: string; inspectionId: string; locationId?: string },
): DefectCaptureInput {
  return {
    projectId: context.projectId,
    inspectionId: context.inspectionId,
    locationId: context.locationId,
    title: item.label,
    category: 'quality',
    severity: 'medium',
  };
}

export function buildDefectOperation(
  input: DefectCaptureInput,
  organizationId: string,
): { draft: OfflineEntity; operation: PendingOperation } {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    projectId: input.projectId,
    category: input.category,
    severity: input.severity,
    title: input.title,
  };
  if (input.description) payload.description = input.description;
  if (input.inspectionId) payload.inspectionId = input.inspectionId;
  if (input.locationId) payload.locationId = input.locationId;
  return {
    draft: {
      id,
      organizationId,
      serverVersion: 0,
      localUpdatedAt: now,
      serverUpdatedAt: null,
      syncState: 'pending' as const,
      tombstone: false,
      ...payload,
      status: 'reported',
    },
    operation: createPendingOperation({
      organizationId,
      entityType: 'defect',
      entityId: id,
      action: 'defect_create',
      baseVersion: null,
      payload,
    }),
  };
}

export async function saveDefectCapture(
  input: DefectCaptureInput,
  organizationId: string,
): Promise<OfflineEntity> {
  const { draft, operation } = buildDefectOperation(input, organizationId);
  await db.transaction(
    'rw',
    db.defectDrafts,
    db.pendingOperations,
    async () => {
      await db.defectDrafts.add(draft);
      await db.pendingOperations.add(operation);
    },
  );
  return draft;
}

export function captureState(
  draft: { syncState: string },
  operationState: string,
): 'synced' | 'held' | 'rejected' {
  if (['rejected', 'failed_permanently'].includes(operationState))
    return 'rejected' as const;
  return draft.syncState === 'synced' && operationState === 'applied'
    ? ('synced' as const)
    : ('held' as const);
}

type Project = OfflineEntity & { code: string; name: string };
type Row = { draft: OfflineEntity; state: 'synced' | 'held' | 'rejected' };

async function loadLocalDefects(organizationId: string): Promise<Row[]> {
  const [drafts, operations] = await Promise.all([
    defectDraftRepository.list(organizationId),
    db.pendingOperations
      .where('organizationId')
      .equals(organizationId)
      .filter((operation) => operation.entityType === 'defect')
      .toArray(),
  ]);
  const stateByEntity = new Map(
    operations.map((operation) => [operation.entityId, operation.state]),
  );
  return drafts
    .map((draft) => ({
      draft,
      state: captureState(draft, stateByEntity.get(draft.id) ?? 'pending'),
    }))
    .sort((a, b) =>
      b.draft.localUpdatedAt.localeCompare(a.draft.localUpdatedAt),
    );
}

export function FieldDefectCapture() {
  const [organizationId, setOrganizationId] = useState<string>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [projectId, setProjectId] = useState('');
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<{
    id: string;
    projectId: string;
  }>();

  const refreshLocal = useCallback(async (id: string) => {
    const [localProjects, defects] = await Promise.all([
      db.projects.where('organizationId').equals(id).toArray(),
      loadLocalDefects(id),
    ]);
    setProjects(localProjects as Project[]);
    setRows(defects);
  }, []);

  const load = useCallback(async () => {
    const stored = await db.syncState.get('field-context');
    const localOrganizationId = (
      stored?.value as { organizationId: string } | undefined
    )?.organizationId;
    if (localOrganizationId) {
      setOrganizationId(localOrganizationId);
      await refreshLocal(localOrganizationId);
    }
    if (!navigator.onLine) return;
    try {
      const organizations =
        await apiRequest<{ id: string }[]>('/organizations');
      const organization = organizations[0];
      if (!organization) return;
      const remoteProjects = await apiRequest<Project[]>(
        `/organizations/${organization.id}/projects`,
      );
      setOrganizationId(organization.id);
      setProjects(remoteProjects);
      await refreshLocal(organization.id);
    } catch {
      // Offline or unauthenticated — the local cache read above still stands.
    }
  }, [refreshLocal]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (
      projects.length &&
      !projects.some((project) => project.id === projectId)
    )
      setProjectId(projects[0]!.id);
  }, [projects, projectId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || !projectId || !category.trim() || !title.trim())
      return;
    setSaving(true);
    try {
      let draft: OfflineEntity;
      try {
        draft = await saveDefectCapture(
          {
            projectId,
            category: category.trim(),
            severity,
            title: title.trim(),
            description: description.trim() || undefined,
          },
          organizationId,
        );
      } catch {
        setMessageIsError(true);
        setMessage("Couldn't save this defect on your device. Try again.");
        return;
      }
      setCategory('');
      setTitle('');
      setDescription('');
      setMessageIsError(false);
      setMessage('Defect saved. It uploads when you reconnect.');
      setLastSaved({ id: draft.id, projectId });
      await refreshLocal(organizationId);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="field-heading">
        <div>
          <p className="eyebrow">On site</p>
          <h1>Report a defect</h1>
          <p>
            Capture what you see now. It saves to this device immediately and
            uploads when you reconnect.
          </p>
        </div>
      </section>
      <section className="panel">
        <h2>New defect</h2>
        {organizationId ? (
          <form
            className="project-form"
            onSubmit={(event) => void submit(event)}
          >
            <label>
              Project
              <select
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                required
              >
                <option value="">Select project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.code} — {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Category
              <input
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="e.g. safety, structural"
                required
              />
            </label>
            <label>
              Severity
              <select
                value={severity}
                onChange={(event) => setSeverity(event.target.value)}
              >
                {severities.map((item) => (
                  <option key={item} value={item}>
                    {severityLabel(item)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Title
              <input
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  if (lastSaved) setLastSaved(undefined);
                }}
                required
              />
            </label>
            <label>
              Description
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <button className="primary" type="submit" disabled={saving}>
              Save defect
            </button>
          </form>
        ) : (
          <p>Sign in and open Today at least once to report defects offline.</p>
        )}
        {message && (
          <p
            role="status"
            className={messageIsError ? 'field-error' : undefined}
          >
            {message}
          </p>
        )}
        {organizationId && lastSaved && (
          <label>
            Add a photo to this defect
            <MediaCapture
              type="photo"
              scope={{
                organizationId,
                projectId: lastSaved.projectId,
                entityType: 'defect',
                entityId: lastSaved.id,
              }}
              onCaptured={() => {
                setMessageIsError(false);
                setMessage('Photo saved to this device.');
              }}
            />
          </label>
        )}
      </section>
      <section className="panel">
        <h2>{rows.length} defects on this device</h2>
        {organizationId && rows.length ? (
          <ul className="domain-list">
            {rows.map(({ draft, state }) => (
              <li className="domain-list-action-row" key={draft.id}>
                <div>
                  <strong>{String(draft.title)}</strong>
                  <span>
                    {String(draft.category)} ·{' '}
                    {severityLabel(String(draft.severity))} ·{' '}
                    {formatTimestamp(draft.localUpdatedAt)}
                  </span>
                  {state === 'rejected' ? (
                    <span className="warning-text">
                      Not accepted by the server. Open Conflicts to resolve.
                    </span>
                  ) : (
                    <span
                      className={
                        state === 'synced'
                          ? 'datum-state'
                          : 'datum-state is-offline'
                      }
                    >
                      {state === 'synced' ? 'Synced' : 'Held on device'}
                    </span>
                  )}
                </div>
                <MediaCapture
                  type="photo"
                  scope={{
                    organizationId,
                    projectId: String(draft.projectId),
                    entityType: 'defect',
                    entityId: draft.id,
                  }}
                  onCaptured={() => {
                    setMessageIsError(false);
                    setMessage('Photo saved to this device.');
                  }}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state">
            <strong>No defects captured yet</strong>
            <span>
              Reports you save here stay on this device until you reconnect.
            </span>
          </div>
        )}
      </section>
    </>
  );
}
