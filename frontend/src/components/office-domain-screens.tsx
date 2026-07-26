'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { apiRequest } from '../lib/api';

type Organization = { id: string; slug: string };
type Project = { id: string; name: string; code: string };
type Site = { id: string; name: string; code: string; status: string };
type Location = {
  id: string;
  parentId: string | null;
  name: string;
  locationType: string;
};
type WorkOrder = {
  id: string;
  title: string;
  status: string;
  priority: string;
  version: number;
  assignments: Assignment[];
  plannedStart?: string | null;
  plannedEnd?: string | null;
};
type Assignment = { id: string; assigneeType: string; assigneeId: string };

async function organization(slug: string) {
  const organizations = await apiRequest<Organization[]>('/organizations');
  const match = organizations.find((item) => item.slug === slug);
  if (!match) throw new Error('Organization not found');
  return match;
}

function useWorkspace(slug: string) {
  const organizationQuery = useQuery({
    queryKey: ['organization', slug],
    queryFn: () => organization(slug),
  });
  const projects = useQuery({
    queryKey: ['projects', organizationQuery.data?.id],
    enabled: Boolean(organizationQuery.data),
    queryFn: () =>
      apiRequest<Project[]>(
        `/organizations/${organizationQuery.data!.id}/projects`,
      ),
  });
  const [projectId, setProjectId] = useState('');
  useEffect(() => {
    if (!projectId && projects.data?.[0]) setProjectId(projects.data[0].id);
  }, [projectId, projects.data]);
  return {
    organizationId: organizationQuery.data?.id,
    projects,
    projectId,
    setProjectId,
  };
}

function ProjectPicker({
  projects,
  value,
  onChange,
}: {
  projects: Project[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="inline-field">
      Project
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select project</option>
        {projects.map((project) => (
          <option value={project.id} key={project.id}>
            {project.code} — {project.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SitesScreen({
  organizationSlug,
}: {
  organizationSlug: string;
}) {
  const workspace = useWorkspace(organizationSlug);
  const client = useQueryClient();
  const [siteId, setSiteId] = useState('');
  const sites = useQuery({
    queryKey: ['sites', workspace.organizationId, workspace.projectId],
    enabled: Boolean(workspace.organizationId && workspace.projectId),
    queryFn: () =>
      apiRequest<Site[]>(
        `/organizations/${workspace.organizationId}/projects/${workspace.projectId}/sites`,
      ),
  });
  useEffect(() => {
    if (!siteId && sites.data?.[0]) setSiteId(sites.data[0].id);
  }, [siteId, sites.data]);
  const locations = useQuery({
    queryKey: [
      'locations',
      workspace.organizationId,
      workspace.projectId,
      siteId,
    ],
    enabled: Boolean(siteId),
    queryFn: () =>
      apiRequest<Location[]>(
        `/organizations/${workspace.organizationId}/projects/${workspace.projectId}/sites/${siteId}/locations`,
      ),
  });
  const createSite = useMutation({
    mutationFn: (input: { name: string; code: string }) =>
      apiRequest(
        `/organizations/${workspace.organizationId}/projects/${workspace.projectId}/sites`,
        { method: 'POST', body: JSON.stringify(input) },
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['sites'] });
      toast.success('Site created.');
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    createSite.mutate({
      name: String(data.get('name')),
      code: String(data.get('code')),
    });
    event.currentTarget.reset();
  }
  return (
    <DomainPage title="Sites & locations" eyebrow="Project geography">
      <ProjectPicker
        projects={workspace.projects.data ?? []}
        value={workspace.projectId}
        onChange={(id) => {
          workspace.setProjectId(id);
          setSiteId('');
        }}
      />
      <div className="domain-grid">
        <section className="panel">
          <h2>Sites</h2>
          {sites.data?.length ? (
            <ul className="domain-list">
              {sites.data.map((site) => (
                <li key={site.id}>
                  <button
                    className={site.id === siteId ? 'selected' : ''}
                    onClick={() => setSiteId(site.id)}
                    type="button"
                  >
                    <strong>{site.name}</strong>
                    <span>
                      {site.code} · {site.status}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="No sites in this project" />
          )}
        </section>
        <section className="panel">
          <h2>Location hierarchy</h2>
          {locations.data?.length ? (
            <ul className="domain-list">
              {locations.data.map((location) => (
                <li key={location.id}>
                  <div>
                    <strong>{location.name}</strong>
                    <span>
                      {location.locationType.replaceAll('_', ' ')}
                      {location.parentId ? ' · nested' : ''}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="No locations in this site" />
          )}
        </section>
        <section className="panel">
          <h2>New site</h2>
          <form className="project-form" onSubmit={submit}>
            <label>
              Name
              <input name="name" required />
            </label>
            <label>
              Code
              <input name="code" pattern="[A-Z0-9][A-Z0-9-]{1,31}" required />
            </label>
            <button
              className="primary"
              disabled={!workspace.projectId || createSite.isPending}
            >
              Create site
            </button>
          </form>
        </section>
      </div>
    </DomainPage>
  );
}

export function WorkOrdersScreen({
  organizationSlug,
  assignmentsOnly = false,
}: {
  organizationSlug: string;
  assignmentsOnly?: boolean;
}) {
  const workspace = useWorkspace(organizationSlug);
  const client = useQueryClient();
  const work = useQuery({
    queryKey: ['work-orders', workspace.organizationId, workspace.projectId],
    enabled: Boolean(workspace.organizationId && workspace.projectId),
    queryFn: () =>
      apiRequest<WorkOrder[]>(
        `/organizations/${workspace.organizationId}/work-orders?projectId=${workspace.projectId}`,
      ),
  });
  const create = useMutation({
    mutationFn: (input: object) =>
      apiRequest(`/organizations/${workspace.organizationId}/work-orders`, {
        method: 'POST',
        body: JSON.stringify({ projectId: workspace.projectId, ...input }),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['work-orders'] });
      toast.success('Work order created.');
    },
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
      apiRequest(
        `/organizations/${workspace.organizationId}/work-orders/${id}/assignments`,
        {
          method: 'POST',
          body: JSON.stringify({ version, assigneeType, assigneeId }),
        },
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['work-orders'] });
      toast.success('Work order assigned.');
    },
  });
  function createWork(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    create.mutate({
      title: data.get('title'),
      workType: data.get('workType'),
      priority: data.get('priority'),
      evidenceRequirements: data.getAll('evidence'),
    });
    event.currentTarget.reset();
  }
  function assignWork(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const item = work.data?.find(
      (candidate) => candidate.id === data.get('workOrderId'),
    );
    if (item)
      assign.mutate({
        id: item.id,
        version: item.version,
        assigneeType: String(data.get('assigneeType')),
        assigneeId: String(data.get('assigneeId')),
      });
  }
  return (
    <DomainPage
      title={assignmentsOnly ? 'Assignments' : 'Work orders'}
      eyebrow="Operations"
    >
      <ProjectPicker
        projects={workspace.projects.data ?? []}
        value={workspace.projectId}
        onChange={workspace.setProjectId}
      />
      <div className="domain-grid">
        <section className="panel domain-wide">
          <h2>{assignmentsOnly ? 'Assignment board' : 'Project work'}</h2>
          {work.data?.length ? (
            <ul className="domain-list">
              {work.data.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <span>
                      {item.priority} · {item.status} ·{' '}
                      {item.assignments.length} assigned
                    </span>
                  </div>
                  <span className="status-pill">v{item.version}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="No work orders in this project" />
          )}
        </section>
        <section className="panel">
          <h2>{assignmentsOnly ? 'Assign work' : 'New work order'}</h2>
          {assignmentsOnly ? (
            <form className="project-form" onSubmit={assignWork}>
              <label>
                Work order
                <select name="workOrderId" required>
                  {work.data?.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Assignee type
                <select name="assigneeType">
                  <option value="user">User</option>
                  <option value="team">Team</option>
                </select>
              </label>
              <label>
                Assignee ID
                <input name="assigneeId" required pattern="[0-9a-fA-F-]{36}" />
              </label>
              <button
                className="primary"
                disabled={!work.data?.length || assign.isPending}
              >
                Assign
              </button>
            </form>
          ) : (
            <form className="project-form" onSubmit={createWork}>
              <label>
                Title
                <input name="title" required />
              </label>
              <label>
                Type
                <input name="workType" required />
              </label>
              <label>
                Priority
                <select name="priority">
                  <option>medium</option>
                  <option>low</option>
                  <option>high</option>
                  <option>critical</option>
                </select>
              </label>
              <fieldset>
                <legend>Evidence</legend>
                <label>
                  <input name="evidence" type="checkbox" value="photo" /> Photo
                </label>
                <label>
                  <input name="evidence" type="checkbox" value="signature" />{' '}
                  Signature
                </label>
              </fieldset>
              <button
                className="primary"
                disabled={!workspace.projectId || create.isPending}
              >
                Create work order
              </button>
            </form>
          )}
        </section>
      </div>
    </DomainPage>
  );
}

type DispatchData = {
  workOrders: WorkOrder[];
  unassigned: WorkOrder[];
  resources: { resourceId: string; resourceType: string; name: string }[];
  recommendations: {
    workOrderId: string;
    resourceId: string;
    resourceType: string;
    resourceName: string;
    score: number;
    conflicts: { code: string; severity: string }[];
  }[];
};

export function DispatchScreen({
  organizationSlug,
}: {
  organizationSlug: string;
}) {
  const workspace = useWorkspace(organizationSlug);
  const dispatch = useQuery({
    queryKey: ['dispatch', workspace.organizationId, workspace.projectId],
    enabled: Boolean(workspace.organizationId && workspace.projectId),
    queryFn: () =>
      apiRequest<DispatchData>(
        `/organizations/${workspace.organizationId}/work-orders/dispatch?projectId=${workspace.projectId}`,
      ),
  });
  return (
    <DomainPage title="Dispatch" eyebrow="Coordinator recommendations">
      <ProjectPicker
        projects={workspace.projects.data ?? []}
        value={workspace.projectId}
        onChange={workspace.setProjectId}
      />
      <p className="notice">
        Recommendations are advisory. FieldPilot never assigns work
        automatically.
      </p>
      <div className="domain-grid">
        <section className="panel">
          <h2>Calendar</h2>
          <ul className="domain-list">
            {dispatch.data?.workOrders.map((workOrder) => (
              <li key={workOrder.id}>
                <div>
                  <strong>{workOrder.title}</strong>
                  <span>
                    {workOrder.plannedStart
                      ? new Date(workOrder.plannedStart).toLocaleString()
                      : 'Unscheduled'}{' '}
                    · {workOrder.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {!dispatch.data?.workOrders.length && (
            <Empty text="No scheduled work" />
          )}
        </section>
        <section className="panel">
          <h2>Resource board</h2>
          <ul className="domain-list">
            {dispatch.data?.resources.map((resource) => (
              <li key={`${resource.resourceType}-${resource.resourceId}`}>
                <div>
                  <strong>{resource.name}</strong>
                  <span>{resource.resourceType}</span>
                </div>
              </li>
            ))}
          </ul>
          {!dispatch.data?.resources.length && (
            <Empty text="No schedule resources" />
          )}
        </section>
        <section className="panel">
          <h2>Unassigned work</h2>
          <ul className="domain-list">
            {dispatch.data?.unassigned.map((workOrder) => (
              <li key={workOrder.id}>
                <div>
                  <strong>{workOrder.title}</strong>
                  <span>{workOrder.priority} priority</span>
                </div>
              </li>
            ))}
          </ul>
          {!dispatch.data?.unassigned.length && (
            <Empty text="All work is assigned" />
          )}
        </section>
        <section className="panel">
          <h2>Recommendations</h2>
          <ul className="domain-list">
            {dispatch.data?.recommendations.map((recommendation) => {
              const workOrder = dispatch.data?.workOrders.find(
                ({ id }) => id === recommendation.workOrderId,
              );
              return (
                <li
                  key={`${recommendation.workOrderId}-${recommendation.resourceId}`}
                >
                  <div>
                    <strong>
                      {workOrder?.title} → {recommendation.resourceName}
                    </strong>
                    <span>
                      Score {recommendation.score} ·{' '}
                      {recommendation.conflicts
                        .map(({ code }) => code.replaceAll('_', ' '))
                        .join(', ') || 'no conflicts'}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          {!dispatch.data?.recommendations.length && (
            <Empty text="No recommendations available" />
          )}
        </section>
      </div>
    </DomainPage>
  );
}

function DomainPage({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
        </div>
      </section>
      {children}
    </>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <strong>{text}</strong>
      <span>Choose another project or create the first record.</span>
    </div>
  );
}
