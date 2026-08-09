'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import {
  needsOfficeAction,
  severityLabel,
  statusLabel,
  type DefectStatus,
} from '../lib/defect-status';

type Organization = { id: string; slug: string };
type Project = { id: string; code: string; name: string };
export type Defect = {
  id: string;
  projectId: string;
  title: string;
  category: string;
  severity: string;
  status: DefectStatus;
  version: number;
  assignments: unknown[];
  corrections: unknown[];
  statusEvents: unknown[];
};

const severityRank: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};
const severities = ['critical', 'high', 'medium', 'low'];

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
    .sort((a, b) => severityRank[a.severity]! - severityRank[b.severity]!);
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
  return { projects, organizationId: organization.id };
}

export function DefectsScreen({
  organizationSlug,
}: {
  organizationSlug: string;
}) {
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
  const defects = useQuery({
    queryKey: ['defects', projects.data?.organizationId, projectId],
    enabled: Boolean(projects.data?.organizationId && projectId),
    queryFn: () =>
      apiRequest<Defect[]>(
        `/organizations/${projects.data!.organizationId}/defects?projectId=${projectId}`,
      ),
  });
  const rows = filterDefects(defects.data ?? [], status, severity);
  const isLoading = projects.isLoading || defects.isLoading;
  const isError = projects.isError || defects.isError;

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
          onChange={(event) => setProjectId(event.target.value)}
        >
          <option value="">Select project</option>
          {(projects.data?.projects ?? []).map((project) => (
            <option value={project.id} key={project.id}>
              {project.code} — {project.name}
            </option>
          ))}
        </select>
      </label>
      <section className="panel">
        <h2>Defect queue</h2>
        <div className="tabs" role="group" aria-label="Filter defects by status">
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
                <div>
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
                </div>
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
    </>
  );
}
