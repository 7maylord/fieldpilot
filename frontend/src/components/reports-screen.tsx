'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { apiBase, apiRequest } from '../lib/api';
import { formatDay } from '../lib/format-date';

type Report = {
  id: string;
  reportDate: string;
  status: string;
  currentRevision: number;
  versions: { revision: number; publishedAt: string | null }[];
};

export function ReportsScreen({
  organizationSlug,
}: {
  organizationSlug: string;
}) {
  const client = useQueryClient();
  const [projectId, setProjectId] = useState('');
  const organization = useQuery({
    queryKey: ['organization', organizationSlug],
    queryFn: async () => {
      const rows =
        await apiRequest<{ id: string; slug: string }[]>('/organizations');
      const match = rows.find(({ slug }) => slug === organizationSlug);
      if (!match) throw new Error('Organization not found');
      return match;
    },
  });
  const projects = useQuery({
    queryKey: ['projects', organization.data?.id],
    enabled: Boolean(organization.data),
    queryFn: () =>
      apiRequest<{ id: string; name: string }[]>(
        `/organizations/${organization.data!.id}/projects`,
      ),
  });
  useEffect(() => {
    if (!projectId && projects.data?.[0]) setProjectId(projects.data[0].id);
  }, [projectId, projects.data]);
  const reports = useQuery({
    queryKey: ['daily-reports', organization.data?.id, projectId],
    enabled: Boolean(projectId),
    queryFn: () =>
      apiRequest<Report[]>(
        `/organizations/${organization.data!.id}/daily-reports?projectId=${projectId}`,
      ),
  });
  const refresh = () =>
    client.invalidateQueries({ queryKey: ['daily-reports'] });
  const create = useMutation({
    mutationFn: (body: object) =>
      apiRequest(`/organizations/${organization.data!.id}/daily-reports`, {
        method: 'POST',
        body: JSON.stringify({ projectId, ...body }),
      }),
    onSuccess: async () => {
      await refresh();
      toast.success('Report draft generated.');
    },
  });
  const action = useMutation({
    mutationFn: ({
      id,
      path,
      body,
    }: {
      id: string;
      path: string;
      body?: object;
    }) =>
      apiRequest(
        `/organizations/${organization.data!.id}/daily-reports/${id}/${path}`,
        { method: 'POST', body: body ? JSON.stringify(body) : undefined },
      ),
    onSuccess: async () => {
      await refresh();
      toast.success('Report updated.');
    },
  });
  function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    create.mutate({
      reportDate: data.get('reportDate'),
      weatherNotes: data.get('weatherNotes'),
    });
  }
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Revisioned records</p>
          <h1>Daily reports</h1>
        </div>
      </section>
      <label className="inline-field">
        Project
        <select
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
        >
          {projects.data?.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
      <div className="domain-grid">
        <section className="panel">
          <h2>Reports</h2>
          <ul className="domain-list">
            {reports.data?.map((report) => (
              <li key={report.id}>
                <div>
                  <strong>{formatDay(report.reportDate)}</strong>
                  <span>
                    {report.status} · revision {report.currentRevision}
                  </span>
                </div>
                <div className="actions">
                  <button
                    type="button"
                    onClick={() =>
                      action.mutate({
                        id: report.id,
                        path: 'reviews',
                        body: { decision: 'approved' },
                      })
                    }
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      action.mutate({ id: report.id, path: 'publish' })
                    }
                  >
                    Publish
                  </button>
                  {report.versions.some(({ publishedAt }) => publishedAt) && (
                    <>
                      <a
                        href={`${apiBase}/organizations/${organization.data!.id}/daily-reports/${report.id}/export.pdf`}
                      >
                        PDF
                      </a>
                      <a
                        href={`${apiBase}/organizations/${organization.data!.id}/daily-reports/${report.id}/export.csv`}
                      >
                        CSV
                      </a>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {!reports.data?.length && <p>No reports generated.</p>}
        </section>
        <section className="panel">
          <h2>Generate draft</h2>
          <form className="project-form" onSubmit={generate}>
            <label>
              Date
              <input name="reportDate" type="date" required />
            </label>
            <label>
              Weather notes
              <textarea name="weatherNotes" />
            </label>
            <button
              className="primary"
              disabled={!projectId || create.isPending}
            >
              Generate report
            </button>
          </form>
          <p>
            Publication requires an approved review and uploaded supervisor
            signature.
          </p>
        </section>
      </div>
    </>
  );
}
