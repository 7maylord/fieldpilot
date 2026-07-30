'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { ApiError, apiRequest } from '../lib/api';
import { SyncConflicts } from './sync-conflicts';

type Organization = { id: string; slug: string };
type Project = { id: string };
export type DashboardWorkOrder = {
  id: string;
  title: string;
  status: string;
  priority: string;
  plannedStart?: string | null;
  dueAt?: string | null;
  assignments?: { id: string }[];
};

export function OperationsDashboard({
  organizationSlug,
  todayLabel,
}: {
  organizationSlug: string;
  todayLabel: string;
}) {
  const [filter, setFilter] = useState('All');
  const [query, setQuery] = useState('');
  const organization = useQuery({
    queryKey: ['organization', organizationSlug],
    queryFn: async () => {
      const organizations = await apiRequest<Organization[]>('/organizations');
      const match = organizations.find(({ slug }) => slug === organizationSlug);
      if (!match) throw new Error('Organization not found');
      return match;
    },
    retry: false,
  });
  const projects = useQuery({
    queryKey: ['projects', organization.data?.id],
    enabled: Boolean(organization.data),
    queryFn: () =>
      apiRequest<Project[]>(`/organizations/${organization.data!.id}/projects`),
  });
  const work = useQuery({
    queryKey: ['dashboard-work-orders', organization.data?.id, projects.data],
    enabled: Boolean(organization.data && projects.data),
    queryFn: async () =>
      (
        await Promise.all(
          (projects.data ?? []).map(({ id }) =>
            apiRequest<DashboardWorkOrder[]>(
              `/organizations/${organization.data!.id}/work-orders?projectId=${id}`,
            ),
          ),
        )
      ).flat(),
  });
  const workOrders = work.data ?? [];
  const visibleWork = searchWork(filteredWork(workOrders, filter), query);
  const hasSearch = Boolean(query.trim());
  const reviewCount = filteredWork(workOrders, 'Review').length;
  const overdueCount = filteredWork(workOrders, 'Overdue').length;
  const assignedCount = filteredWork(workOrders, 'Assigned').length;
  const error = organization.error ?? projects.error ?? work.error;
  const isLoading =
    organization.isLoading || projects.isLoading || work.isLoading;
  const noProjects = projects.isSuccess && projects.data.length === 0;
  const errorCopy = dashboardError(error);

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">{todayLabel}</p>
          <h1>Today’s Operations</h1>
        </div>
        <Link className="primary" href={`/${organizationSlug}/work`}>
          New work order
        </Link>
      </section>
      <section className="context-console" aria-label="Operations context">
        <div>
          <p className="eyebrow">Command center</p>
          <h2>Find the operational context before the field asks twice.</h2>
        </div>
        <label className="context-command">
          <span>Search work, status, priority</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try drilling, submitted, high..."
          />
        </label>
        <div className="context-metrics" aria-label="Live workspace counts">
          <Metric label="Projects" value={projects.data?.length ?? 0} />
          <Metric label="Work orders" value={workOrders.length} />
          <Metric label="Assigned" value={assignedCount} />
          <Metric label="Needs attention" value={reviewCount + overdueCount} />
        </div>
      </section>
      {errorCopy && (
        <div className="notice" role="alert">
          {errorCopy}
        </div>
      )}
      <div className="dashboard-grid">
        <section className="panel work-queue">
          <div className="section-title">
            <h2>
              Work queue <span>{workOrders.length}</span>
            </h2>
          </div>
          <div className="tabs" role="group" aria-label="Filter work orders">
            {['All', 'Assigned', 'Review', 'Overdue'].map((item) => (
              <button
                className={filter === item ? 'active' : ''}
                onClick={() => setFilter(item)}
                type="button"
                key={item}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="work-list">
            {!error &&
              !isLoading &&
              visibleWork.map((item) => (
                <Link
                  className="work-row"
                  href={`/${organizationSlug}/work`}
                  key={item.id}
                >
                  <span className="status-dot" />
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.status.replaceAll('_', ' ')}</small>
                  </span>
                  <span className={`priority ${item.priority.toLowerCase()}`}>
                    {item.priority}
                  </span>
                  <time>{workTime(item)}</time>
                </Link>
              ))}
            {(error || isLoading || visibleWork.length === 0) && (
              <div className="empty-state">
                <strong>
                  {emptyTitle(filter, {
                    error,
                    hasSearch,
                    isLoading,
                    noProjects,
                  })}
                </strong>
                <span>
                  {emptyText(filter, {
                    error,
                    hasSearch,
                    isLoading,
                    noProjects,
                  })}
                </span>
              </div>
            )}
          </div>
        </section>
        <aside className="status-stack">
          <SyncConflicts organizationSlug={organizationSlug} />
          <section className="panel">
            <h2>Assignment coverage</h2>
            <p className="big-number">
              {assignedCount} <small>assigned work orders</small>
            </p>
            <dl>
              <div>
                <dt>Unassigned</dt>
                <dd>{workOrders.length - assignedCount}</dd>
              </div>
              <div>
                <dt>Under review</dt>
                <dd>{reviewCount}</dd>
              </div>
              <div>
                <dt>Overdue</dt>
                <dd>{overdueCount}</dd>
              </div>
            </dl>
          </section>
          <section className="panel alerts">
            <h2>
              Attention <span>{reviewCount + overdueCount}</span>
            </h2>
            <Link href={`/${organizationSlug}/work`}>
              {overdueCount} overdue work orders
            </Link>
            <Link href={`/${organizationSlug}/work`}>
              {reviewCount} work orders ready for review
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function filteredWork(workOrders: DashboardWorkOrder[], filter: string) {
  if (filter === 'Assigned')
    return workOrders.filter(({ assignments }) => assignments?.length);
  if (filter === 'Review')
    return workOrders.filter(({ status }) =>
      ['submitted', 'under_review'].includes(status),
    );
  if (filter === 'Overdue') {
    const now = Date.now();
    return workOrders.filter(
      ({ dueAt, status }) =>
        dueAt &&
        new Date(dueAt).getTime() < now &&
        !['completed', 'cancelled'].includes(status),
    );
  }
  return workOrders;
}

export function searchWork(workOrders: DashboardWorkOrder[], query: string) {
  const term = query.trim().toLowerCase();
  if (!term) return workOrders;
  return workOrders.filter((workOrder) =>
    [workOrder.title, workOrder.status, workOrder.priority]
      .join(' ')
      .toLowerCase()
      .includes(term),
  );
}

function workTime(workOrder: DashboardWorkOrder) {
  const value = workOrder.plannedStart ?? workOrder.dueAt;
  return value ? new Date(value).toLocaleString() : 'Unscheduled';
}

function dashboardError(error: unknown) {
  if (!error) return '';
  if (error instanceof ApiError) {
    if (error.status === 401)
      return 'Your session has expired. Sign in again to load dashboard data.';
    if (error.status === 403)
      return 'You do not have access to this workspace.';
    if (error.status >= 500)
      return 'Live dashboard data is unavailable because the API server returned an error.';
  }
  if (error instanceof Error && error.message === 'Organization not found')
    return 'Workspace not found for this account.';
  return 'Live dashboard data is unavailable. Check the API server or your network connection.';
}

function emptyTitle(
  filter: string,
  state: {
    error: unknown;
    hasSearch: boolean;
    isLoading: boolean;
    noProjects: boolean;
  },
) {
  if (state.error) return 'Dashboard data unavailable';
  if (state.isLoading) return 'Loading dashboard data…';
  if (state.hasSearch) return 'No matching work orders';
  if (state.noProjects) return 'No projects yet';
  if (filter === 'Review') return 'No work is waiting for review';
  if (filter === 'Overdue') return 'No overdue work orders';
  if (filter === 'Assigned') return 'No assigned work orders';
  return 'No work orders yet';
}

function emptyText(
  filter: string,
  state: {
    error: unknown;
    hasSearch: boolean;
    isLoading: boolean;
    noProjects: boolean;
  },
) {
  if (state.error)
    return 'Refresh after the connection or API server recovers.';
  if (state.isLoading) return 'Live dashboard data is loading.';
  if (state.hasSearch) return 'Clear the search or try another term.';
  if (state.noProjects) return 'Create a project before raising work orders.';
  if (filter === 'All') return 'Raise the first work order when work is ready.';
  return 'Try another filter or update the matching work orders.';
}
