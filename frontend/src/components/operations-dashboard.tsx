'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { apiRequest } from '../lib/api';
import { SyncConflicts } from './sync-conflicts';

type Organization = { id: string; slug: string };
type Project = { id: string };
type WorkOrder = {
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
}: {
  organizationSlug: string;
}) {
  const [filter, setFilter] = useState('All');
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
            apiRequest<WorkOrder[]>(
              `/organizations/${organization.data!.id}/work-orders?projectId=${id}`,
            ),
          ),
        )
      ).flat(),
  });
  const workOrders = work.data ?? [];
  const visibleWork = filteredWork(workOrders, filter);
  const reviewCount = filteredWork(workOrders, 'Review').length;
  const overdueCount = filteredWork(workOrders, 'Overdue').length;
  const assignedCount = filteredWork(workOrders, 'Assigned').length;
  const error = organization.error ?? projects.error ?? work.error;

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">
            {new Date().toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </p>
          <h1>Today’s Operations</h1>
        </div>
        <Link className="primary" href={`/${organizationSlug}/work`}>
          New work order
        </Link>
      </section>
      {error && (
        <div className="notice" role="status">
          Unable to load live dashboard data. Sign in or check your workspace.
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
            {visibleWork.map((item) => (
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
            {visibleWork.length === 0 && (
              <div className="empty-state">
                <strong>{emptyTitle(filter)}</strong>
                <span>Live work orders will appear here.</span>
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

function filteredWork(workOrders: WorkOrder[], filter: string) {
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

function workTime(workOrder: WorkOrder) {
  const value = workOrder.plannedStart ?? workOrder.dueAt;
  return value ? new Date(value).toLocaleString() : 'Unscheduled';
}

function emptyTitle(filter: string) {
  if (filter === 'Review') return 'No work is waiting for review';
  if (filter === 'Overdue') return 'No overdue work orders';
  if (filter === 'Assigned') return 'No assigned work orders';
  return 'No work orders yet';
}
