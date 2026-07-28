'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { apiRequest } from '../lib/api';
import { db, type OfflineEntity } from '../lib/offline/database';
import { projectRepository } from '../lib/offline/repositories';

type Organization = { id: string; slug: string };
type Project = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  status: string;
  timezone: string;
  version: number;
  updatedAt: string;
};
type Site = { id: string; name: string; code: string; status: string };
type WorkOrder = {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignments: unknown[];
};
type Asset = { id: string; name: string; status: string };
type Report = { id: string; reportDate: string; status: string };
type FormTemplate = {
  id: string;
  name: string;
  versions: Array<{ id: string; status: string; versionNumber: number }>;
};
const schema = z.object({
  name: z.string().min(1),
  code: z.string().regex(/^[A-Z0-9][A-Z0-9-]{1,31}$/),
  timezone: z.string().min(1),
});
type Input = z.infer<typeof schema>;

async function resolveOrganization(slug: string) {
  const organizations = await apiRequest<Organization[]>('/organizations');
  const organization = organizations.find((item) => item.slug === slug);
  if (!organization) throw new Error('Organization not found');
  return organization;
}

async function loadProjects(slug: string) {
  const organization = await resolveOrganization(slug);
  try {
    const projects = await apiRequest<Project[]>(
      `/organizations/${organization.id}/projects`,
    );
    await db.projects.bulkPut(
      projects.map(
        (project) =>
          ({
            ...project,
            localUpdatedAt: project.updatedAt,
            serverUpdatedAt: project.updatedAt,
            serverVersion: project.version,
            syncState: 'synced',
            tombstone: project.status === 'archived',
          }) satisfies OfflineEntity,
      ),
    );
    return { projects, offline: false, organizationId: organization.id };
  } catch {
    const projects = (await projectRepository.list(organization.id)).map(
      (project) => project as OfflineEntity & Project,
    );
    return { projects, offline: true, organizationId: organization.id };
  }
}

export function ProjectsScreen({
  organizationSlug,
}: {
  organizationSlug: string;
}) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['projects', organizationSlug],
    queryFn: () => loadProjects(organizationSlug),
  });
  const [selectedProjectId, setSelectedProjectId] = useState('');
  useEffect(() => {
    if (
      query.data?.projects.length &&
      !query.data.projects.some((project) => project.id === selectedProjectId)
    )
      setSelectedProjectId(query.data.projects[0]!.id);
  }, [query.data?.projects, selectedProjectId]);
  const selectedProject = query.data?.projects.find(
    (project) => project.id === selectedProjectId,
  );
  const sites = useQuery({
    queryKey: ['project-detail-sites', query.data?.organizationId, selectedProjectId],
    enabled: Boolean(query.data?.organizationId && selectedProjectId),
    queryFn: () =>
      apiRequest<Site[]>(
        `/organizations/${query.data!.organizationId}/projects/${selectedProjectId}/sites`,
      ),
  });
  const workOrders = useQuery({
    queryKey: ['project-detail-work', query.data?.organizationId, selectedProjectId],
    enabled: Boolean(query.data?.organizationId && selectedProjectId),
    queryFn: () =>
      apiRequest<WorkOrder[]>(
        `/organizations/${query.data!.organizationId}/work-orders?projectId=${selectedProjectId}`,
      ),
  });
  const assets = useQuery({
    queryKey: ['project-detail-assets', query.data?.organizationId, selectedProjectId],
    enabled: Boolean(query.data?.organizationId && selectedProjectId),
    queryFn: () =>
      apiRequest<Asset[]>(
        `/organizations/${query.data!.organizationId}/assets?projectId=${selectedProjectId}`,
      ),
  });
  const reports = useQuery({
    queryKey: ['project-detail-reports', query.data?.organizationId, selectedProjectId],
    enabled: Boolean(query.data?.organizationId && selectedProjectId),
    queryFn: () =>
      apiRequest<Report[]>(
        `/organizations/${query.data!.organizationId}/daily-reports?projectId=${selectedProjectId}`,
      ),
  });
  const forms = useQuery({
    queryKey: ['project-detail-forms', query.data?.organizationId],
    enabled: Boolean(query.data?.organizationId),
    queryFn: () =>
      apiRequest<FormTemplate[]>(
        `/organizations/${query.data!.organizationId}/form-templates`,
      ),
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Input>({
    resolver: zodResolver(schema),
    defaultValues: {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  });
  const create = useMutation({
    mutationFn: async (input: Input) => {
      const organization = await resolveOrganization(organizationSlug);
      return apiRequest<Project>(`/organizations/${organization.id}/projects`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: async () => {
      reset();
      await client.invalidateQueries({
        queryKey: ['projects', organizationSlug],
      });
      toast.success('Project created.');
    },
  });

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Portfolio</p>
          <h1>Projects</h1>
        </div>
      </section>
      <div className="projects-grid">
        <section className="panel">
          <h2>All projects</h2>
          {query.data?.offline && (
            <p className="warning-text" role="status">
              Showing downloaded projects.
            </p>
          )}
          {query.isLoading ? (
            <p>Loading projects…</p>
          ) : query.isError ? (
            <div className="empty-state">
              <strong>Projects are unavailable</strong>
              <span>Sign in or reconnect to load this organization.</span>
            </div>
          ) : query.data?.projects.length ? (
            <ul className="project-list">
              {query.data.projects.map((project) => (
                <li key={project.id}>
                  <button
                    className={`project-list-button ${
                      selectedProjectId === project.id ? 'selected' : ''
                    }`}
                    type="button"
                    onClick={() => setSelectedProjectId(project.id)}
                  >
                    <div>
                      <strong>{project.name}</strong>
                      <span>
                        {project.code} · {project.timezone}
                      </span>
                    </div>
                    <span className="status-pill">{project.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state">
              <strong>No projects yet</strong>
              <span>Create the first project for this organization.</span>
            </div>
          )}
        </section>
        <section className="panel">
          <h2>Project details</h2>
          {selectedProject ? (
            <>
              <span className="status-pill">{selectedProject.status}</span>
              <h3>{selectedProject.name}</h3>
              <dl>
                <div>
                  <dt>Code</dt>
                  <dd>{selectedProject.code}</dd>
                </div>
                <div>
                  <dt>Timezone</dt>
                  <dd>{selectedProject.timezone}</dd>
                </div>
                <div>
                  <dt>Version</dt>
                  <dd>v{selectedProject.version}</dd>
                </div>
              </dl>
              <div className="project-detail-grid">
                <ProjectDetailList
                  title={`Sites (${sites.data?.length ?? 0})`}
                  items={(sites.data ?? []).map(
                    (site) => `${site.code} · ${site.name} · ${site.status}`,
                  )}
                />
                <ProjectDetailList
                  title={`Work orders (${workOrders.data?.length ?? 0})`}
                  items={(workOrders.data ?? []).map(
                    (workOrder) =>
                      `${workOrder.priority} · ${workOrder.title} · ${
                        workOrder.status
                      } · ${workOrder.assignments.length} assigned`,
                  )}
                />
                <ProjectDetailList
                  title={`Assets (${assets.data?.length ?? 0})`}
                  items={(assets.data ?? []).map(
                    (asset) => `${asset.name} · ${asset.status}`,
                  )}
                />
                <ProjectDetailList
                  title={`Reports (${reports.data?.length ?? 0})`}
                  items={(reports.data ?? []).map(
                    (report) =>
                      `${report.reportDate.slice(0, 10)} · ${report.status}`,
                  )}
                />
                <ProjectDetailList
                  title="Published forms/checklists"
                  items={(forms.data ?? [])
                    .flatMap((form) =>
                      form.versions
                        .filter((version) => version.status === 'published')
                        .map(
                          (version) =>
                            `${form.name} · v${version.versionNumber}`,
                        ),
                    )
                    .slice(0, 12)}
                  empty="No published forms yet"
                />
              </div>
            </>
          ) : (
            <p>Select a project to see its sites, work, assets, and reports.</p>
          )}
        </section>
        <section className="panel">
          <h2>New project</h2>
          <form
            className="project-form"
            onSubmit={handleSubmit((input) => create.mutate(input))}
          >
            <label>
              Name
              <input {...register('name')} />
              {errors.name && (
                <span className="field-error">Name is required</span>
              )}
            </label>
            <label>
              Code
              <input {...register('code')} placeholder="BRIDGE-01" />
              {errors.code && (
                <span className="field-error">
                  Use uppercase letters, numbers, or hyphens
                </span>
              )}
            </label>
            <label>
              Timezone
              <input {...register('timezone')} />
              {errors.timezone && (
                <span className="field-error">Timezone is required</span>
              )}
            </label>
            <button
              className="primary"
              type="submit"
              disabled={create.isPending}
            >
              {create.isPending ? 'Creating…' : 'Create project'}
            </button>
            {create.isError && (
              <p className="field-error" role="alert">
                Project could not be created.
              </p>
            )}
          </form>
        </section>
      </div>
    </>
  );
}

function ProjectDetailList({
  title,
  items,
  empty = 'Nothing here yet',
}: {
  title: string;
  items: string[];
  empty?: string;
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
