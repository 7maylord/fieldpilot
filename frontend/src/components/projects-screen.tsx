'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
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
                  <div>
                    <strong>{project.name}</strong>
                    <span>
                      {project.code} · {project.timezone}
                    </span>
                  </div>
                  <span className="status-pill">{project.status}</span>
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
