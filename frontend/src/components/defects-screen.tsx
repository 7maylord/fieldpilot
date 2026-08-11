'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ApiError, apiRequest } from '../lib/api';
import {
  allowedTransitions,
  capabilitiesForRole,
  needsOfficeAction,
  severities,
  severityLabel,
  statusLabel,
  type DefectStatus,
} from '../lib/defect-status';
import { formatTimestamp } from '../lib/format-date';

type Organization = {
  id: string;
  slug: string;
  membership?: { role: string; isExternal: boolean };
};
type Project = { id: string; code: string; name: string };
type Assignment = { assigneeType: string; assigneeId: string };
type Correction = { id: string; rootCause: string; correctiveAction: string };
type StatusEvent = {
  fromStatus: string | null;
  toStatus: string;
  comment?: string | null;
};
type Team = { id: string; name: string };
type Member = { userId: string; status: string; user?: { email: string } };
type MediaItem = { id: string; mimeType: string; createdAt: string };

export type Defect = {
  id: string;
  projectId: string;
  title: string;
  category: string;
  severity: string;
  status: DefectStatus;
  version: number;
  assignments: Assignment[];
  corrections: Correction[];
  statusEvents: StatusEvent[];
};

export type DefectAction =
  | { kind: 'transition'; to: DefectStatus }
  | { kind: 'assign' }
  | { kind: 'correct' }
  | { kind: 'verify' };

export function availableActions(
  defect: Defect,
  capabilities: string[],
): DefectAction[] {
  const can = (capability: string) => capabilities.includes(capability);
  const actions: DefectAction[] = allowedTransitions(defect.status)
    .filter((to) => to !== 'assigned' || defect.assignments.length > 0)
    .filter((to) => to !== 'verified' || can('defects.verify'))
    .filter(() => can('defects.create'))
    .map((to) => ({ kind: 'transition', to }) as const);
  if (defect.status === 'triaged' && can('defects.assign'))
    actions.push({ kind: 'assign' });
  if (defect.status === 'correction_in_progress' && can('defects.create'))
    actions.push({ kind: 'correct' });
  if (defect.status === 'ready_for_verification' && can('defects.verify'))
    actions.push({ kind: 'verify' });
  return actions;
}

const severityRank: Record<string, number> = Object.fromEntries(
  severities.map((severity, index) => [severity, index]),
);

export function filterDefects(
  defects: Defect[],
  status: string,
  severity: string,
) {
  return defects
    .filter((row) =>
      status === 'All'
        ? true
        : status === 'Needs action'
          ? needsOfficeAction.includes(row.status)
          : row.status === status,
    )
    .filter((row) => severity === 'All' || row.severity === severity)
    .sort(
      (a, b) =>
        (severityRank[a.severity] ?? Number.MAX_SAFE_INTEGER) -
        (severityRank[b.severity] ?? Number.MAX_SAFE_INTEGER),
    );
}

async function resolveOrganization(slug: string) {
  const organizations = await apiRequest<Organization[]>('/organizations');
  const organization = organizations.find((item) => item.slug === slug);
  if (!organization) throw new Error('Organization not found');
  return organization;
}

async function loadProjects(slug: string) {
  const organization = await resolveOrganization(slug);
  const projects = await apiRequest<Project[]>(
    `/organizations/${organization.id}/projects`,
  );
  return {
    projects,
    organizationId: organization.id,
    capabilities: capabilitiesForRole(
      organization.membership?.role ?? 'viewer',
      organization.membership?.isExternal ?? false,
    ),
  };
}

export function DefectsScreen({
  organizationSlug,
}: {
  organizationSlug: string;
}) {
  const client = useQueryClient();
  const projects = useQuery({
    queryKey: ['projects', organizationSlug],
    queryFn: () => loadProjects(organizationSlug),
  });
  const [projectId, setProjectId] = useState('');
  useEffect(() => {
    if (
      projects.data?.projects.length &&
      !projects.data.projects.some((project) => project.id === projectId)
    )
      setProjectId(projects.data.projects[0]!.id);
  }, [projects.data, projectId]);
  const [status, setStatus] = useState('Needs action');
  const [severity, setSeverity] = useState('All');
  const organizationId = projects.data?.organizationId;
  const defects = useQuery({
    queryKey: ['defects', organizationId, projectId],
    enabled: Boolean(organizationId && projectId),
    queryFn: () =>
      apiRequest<Defect[]>(
        `/organizations/${organizationId}/defects?projectId=${projectId}`,
      ),
  });
  const rows = filterDefects(defects.data ?? [], status, severity);
  const isLoading = projects.isLoading || defects.isLoading;
  const isError = projects.isError || defects.isError;
  const capabilities = projects.data?.capabilities ?? [];

  const [selectedId, setSelectedId] = useState('');
  useEffect(() => {
    if (!rows.length) {
      if (selectedId) setSelectedId('');
      return;
    }
    if (!rows.some((row) => row.id === selectedId)) setSelectedId(rows[0]!.id);
  }, [rows, selectedId]);
  const selected = rows.find((row) => row.id === selectedId);

  const [openAction, setOpenAction] = useState<DefectAction['kind'] | null>(
    null,
  );
  const [stale, setStale] = useState(false);
  const actions = selected ? availableActions(selected, capabilities) : [];

  const teams = useQuery({
    queryKey: ['teams', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => apiRequest<Team[]>(`/organizations/${organizationId}/teams`),
  });
  const members = useQuery({
    queryKey: ['members', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () =>
      apiRequest<Member[]>(`/organizations/${organizationId}/members`),
  });
  const evidence = useQuery({
    queryKey: ['media', organizationId, selected?.id],
    enabled: Boolean(organizationId && selected) && openAction === 'correct',
    queryFn: () =>
      apiRequest<MediaItem[]>(
        `/organizations/${organizationId}/media?projectId=${selected!.projectId}&entityType=defect&entityId=${selected!.id}`,
      ),
  });

  function onActionError(error: unknown) {
    if (error instanceof ApiError && error.status === 409) setStale(true);
  }
  async function onActionSuccess(message: string) {
    await client.invalidateQueries({ queryKey: ['defects'] });
    setOpenAction(null);
    toast.success(message);
  }
  function reload() {
    setStale(false);
    void client.invalidateQueries({ queryKey: ['defects'] });
  }

  const transition = useMutation({
    mutationFn: ({
      id,
      version,
      to,
    }: {
      id: string;
      version: number;
      to: DefectStatus;
    }) =>
      apiRequest(`/organizations/${organizationId}/defects/${id}/transitions`, {
        method: 'POST',
        body: JSON.stringify({ version, status: to }),
      }),
    onSuccess: () => onActionSuccess('Defect updated.'),
    onError: onActionError,
  });
  const assign = useMutation({
    mutationFn: ({
      id,
      version,
      assigneeType,
      assigneeId,
    }: {
      id: string;
      version: number;
      assigneeType: string;
      assigneeId: string;
    }) =>
      apiRequest(`/organizations/${organizationId}/defects/${id}/assignments`, {
        method: 'POST',
        body: JSON.stringify({ version, assigneeType, assigneeId }),
      }),
    onSuccess: () => onActionSuccess('Defect assigned.'),
    onError: onActionError,
  });
  const correct = useMutation({
    mutationFn: ({
      id,
      version,
      rootCause,
      correctiveAction,
      evidenceIds,
    }: {
      id: string;
      version: number;
      rootCause: string;
      correctiveAction: string;
      evidenceIds: string[];
    }) =>
      apiRequest(`/organizations/${organizationId}/defects/${id}/corrections`, {
        method: 'POST',
        body: JSON.stringify({
          version,
          rootCause,
          correctiveAction,
          evidenceIds,
        }),
      }),
    onSuccess: () => onActionSuccess('Correction submitted.'),
    onError: onActionError,
  });
  const verify = useMutation({
    mutationFn: ({
      id,
      version,
      correctionId,
      decision,
    }: {
      id: string;
      version: number;
      correctionId: string;
      decision: 'verified' | 'rejected';
    }) =>
      apiRequest(
        `/organizations/${organizationId}/defects/${id}/verifications`,
        {
          method: 'POST',
          body: JSON.stringify({ version, correctionId, decision }),
        },
      ),
    onSuccess: () => onActionSuccess('Verification recorded.'),
    onError: onActionError,
  });

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Quality</p>
          <h1>Defects</h1>
        </div>
      </section>
      <label className="inline-field">
        Project
        <select
          value={projectId}
          onChange={(event) => {
            setProjectId(event.target.value);
            setSelectedId('');
          }}
        >
          <option value="">Select project</option>
          {(projects.data?.projects ?? []).map((project) => (
            <option value={project.id} key={project.id}>
              {project.code} — {project.name}
            </option>
          ))}
        </select>
      </label>
      {stale && (
        <div className="notice" role="alert">
          <span>
            This defect changed while you were looking at it. Reload to see the
            latest.
          </span>
          <button type="button" onClick={reload}>
            Reload
          </button>
        </div>
      )}
      <div className="domain-grid">
        <section className="panel domain-wide">
          <h2>Defect queue</h2>
          <div
            className="tabs"
            role="group"
            aria-label="Filter defects by status"
          >
            {['Needs action', 'All'].map((item) => (
              <button
                className={status === item ? 'active' : ''}
                onClick={() => setStatus(item)}
                type="button"
                key={item}
              >
                {item}
              </button>
            ))}
          </div>
          <label className="inline-field">
            Severity
            <select
              value={severity}
              onChange={(event) => setSeverity(event.target.value)}
            >
              <option value="All">All</option>
              {severities.map((item) => (
                <option value={item} key={item}>
                  {severityLabel(item)}
                </option>
              ))}
            </select>
          </label>
          {isLoading ? (
            <p>Loading defects…</p>
          ) : isError ? (
            <div className="empty-state">
              <strong>Defects are unavailable</strong>
              <span>Sign in or reconnect to load this project.</span>
            </div>
          ) : rows.length ? (
            <ul className="domain-list">
              {rows.map((defect) => (
                <li key={defect.id}>
                  <button
                    type="button"
                    className={selectedId === defect.id ? 'selected' : ''}
                    onClick={() => setSelectedId(defect.id)}
                  >
                    <div>
                      <strong>{defect.title}</strong>
                      <span>
                        {defect.category} ·{' '}
                        <span className={`priority ${defect.severity}`}>
                          {severityLabel(defect.severity)}
                        </span>{' '}
                        · {defect.assignments.length} assigned
                      </span>
                    </div>
                    <span className="status-pill">
                      {statusLabel(defect.status)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state">
              <strong>No defects match this view</strong>
              <span>Change the filter or check another project.</span>
            </div>
          )}
        </section>
        <aside className="panel field-detail">
          <h2>Defect details</h2>
          {selected ? (
            <>
              <span className="status-pill">
                {statusLabel(selected.status)}
              </span>
              <h3>{selected.title}</h3>
              <dl>
                <div>
                  <dt>Category</dt>
                  <dd>{selected.category}</dd>
                </div>
                <div>
                  <dt>Severity</dt>
                  <dd>{severityLabel(selected.severity)}</dd>
                </div>
                <div>
                  <dt>Version</dt>
                  <dd>{selected.version}</dd>
                </div>
              </dl>
              <div className="detail-stack">
                <DetailList
                  title="Assignments"
                  empty="Not assigned yet"
                  items={selected.assignments.map(
                    (assignment) =>
                      `${assignment.assigneeType}: ${assignment.assigneeId}`,
                  )}
                />
                <DetailList
                  title="Corrections"
                  empty="No corrections submitted"
                  items={selected.corrections.map(
                    (correction) => correction.rootCause,
                  )}
                />
                <DetailList
                  title="Status history"
                  empty="No status changes yet"
                  items={selected.statusEvents.map(
                    (event) =>
                      `${event.fromStatus ?? 'Reported'} → ${statusLabel(event.toStatus as DefectStatus)}`,
                  )}
                />
              </div>
              {actions.length > 0 && (
                <div className="actions">
                  {actions.map((action) => (
                    <button
                      key={
                        action.kind === 'transition'
                          ? `transition-${action.to}`
                          : action.kind
                      }
                      type="button"
                      disabled={
                        action.kind === 'transition' && transition.isPending
                      }
                      onClick={() =>
                        action.kind === 'transition'
                          ? transition.mutate({
                              id: selected.id,
                              version: selected.version,
                              to: action.to,
                            })
                          : setOpenAction(
                              openAction === action.kind ? null : action.kind,
                            )
                      }
                    >
                      {action.kind === 'transition'
                        ? statusLabel(action.to)
                        : action.kind === 'assign'
                          ? 'Assign'
                          : action.kind === 'correct'
                            ? 'Submit correction'
                            : 'Verify'}
                    </button>
                  ))}
                </div>
              )}
              {openAction === 'assign' && (
                <AssignForm
                  defect={selected}
                  teams={teams.data ?? []}
                  members={members.data ?? []}
                  pending={assign.isPending}
                  onSubmit={(input) => assign.mutate(input)}
                />
              )}
              {openAction === 'correct' && (
                <CorrectForm
                  defect={selected}
                  evidence={evidence.data ?? []}
                  pending={correct.isPending}
                  onSubmit={(input) => correct.mutate(input)}
                />
              )}
              {openAction === 'verify' && (
                <VerifyForm
                  defect={selected}
                  pending={verify.isPending}
                  onSubmit={(input) => verify.mutate(input)}
                />
              )}
            </>
          ) : (
            <p>Select a defect to see its details.</p>
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
          {items.map((item, index) => (
            <li key={`${title}-${index}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>{empty}</p>
      )}
    </section>
  );
}

function AssignForm({
  defect,
  teams,
  members,
  pending,
  onSubmit,
}: {
  defect: Defect;
  teams: Team[];
  members: Member[];
  pending: boolean;
  onSubmit: (input: {
    id: string;
    version: number;
    assigneeType: string;
    assigneeId: string;
  }) => void;
}) {
  const [assigneeType, setAssigneeType] = useState<'user' | 'team'>('team');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const assigneeId = String(data.get('assigneeId') ?? '');
    if (!assigneeId) return;
    onSubmit({
      id: defect.id,
      version: defect.version,
      assigneeType,
      assigneeId,
    });
  }
  return (
    <form className="project-form" onSubmit={submit}>
      <h3>Assign defect</h3>
      <label>
        Assignee type
        <select
          value={assigneeType}
          onChange={(event) =>
            setAssigneeType(event.target.value as 'user' | 'team')
          }
        >
          <option value="team">Team</option>
          <option value="user">User</option>
        </select>
      </label>
      <label>
        Assignee
        <select name="assigneeId" required>
          <option value="">Select assignee</option>
          {assigneeType === 'team'
            ? teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))
            : members
                .filter((member) => member.status === 'active')
                .map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.user?.email ?? member.userId}
                  </option>
                ))}
        </select>
      </label>
      <button className="primary" disabled={pending}>
        {pending ? 'Assigning…' : 'Assign'}
      </button>
    </form>
  );
}

export function toggleEvidenceSelection(current: string[], mediaId: string) {
  return current.includes(mediaId)
    ? current.filter((id) => id !== mediaId)
    : [...current, mediaId];
}

function CorrectForm({
  defect,
  evidence,
  pending,
  onSubmit,
}: {
  defect: Defect;
  evidence: MediaItem[];
  pending: boolean;
  onSubmit: (input: {
    id: string;
    version: number;
    rootCause: string;
    correctiveAction: string;
    evidenceIds: string[];
  }) => void;
}) {
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  function toggleEvidence(mediaId: string) {
    setEvidenceIds((current) => toggleEvidenceSelection(current, mediaId));
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit({
      id: defect.id,
      version: defect.version,
      rootCause: String(data.get('rootCause') ?? ''),
      correctiveAction: String(data.get('correctiveAction') ?? ''),
      evidenceIds,
    });
  }
  return (
    <form className="project-form" onSubmit={submit}>
      <h3>Submit correction</h3>
      <label>
        Root cause
        <textarea name="rootCause" required />
      </label>
      <label>
        Corrective action
        <textarea name="correctiveAction" required />
      </label>
      <fieldset>
        <legend>Evidence</legend>
        {evidence.length ? (
          <ul className="conflict-list">
            {evidence.map((item) => (
              <li key={item.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={evidenceIds.includes(item.id)}
                    onChange={() => toggleEvidence(item.id)}
                  />
                  {item.mimeType} — {formatTimestamp(item.createdAt)}
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state">
            <strong>No evidence attached to this defect yet</strong>
          </div>
        )}
      </fieldset>
      <button className="primary" disabled={pending}>
        {pending ? 'Submitting…' : 'Submit correction'}
      </button>
    </form>
  );
}

function VerifyForm({
  defect,
  pending,
  onSubmit,
}: {
  defect: Defect;
  pending: boolean;
  onSubmit: (input: {
    id: string;
    version: number;
    correctionId: string;
    decision: 'verified' | 'rejected';
  }) => void;
}) {
  const latest = defect.corrections[defect.corrections.length - 1];
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!latest) return;
    const data = new FormData(event.currentTarget);
    onSubmit({
      id: defect.id,
      version: defect.version,
      correctionId: latest.id,
      decision: String(data.get('decision')) as 'verified' | 'rejected',
    });
  }
  if (!latest) return <p>No correction to verify yet.</p>;
  return (
    <form className="project-form" onSubmit={submit}>
      <h3>Verify correction</h3>
      <p>{latest.rootCause}</p>
      <label>
        Decision
        <select name="decision" defaultValue="verified">
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
        </select>
      </label>
      <button className="primary" disabled={pending}>
        {pending ? 'Recording…' : 'Record decision'}
      </button>
    </form>
  );
}
