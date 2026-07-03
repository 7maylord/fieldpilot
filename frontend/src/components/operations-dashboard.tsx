'use client';

import { useState } from 'react';
import { SyncConflicts } from './sync-conflicts';

const work = [
  {
    id: 'WO-250521-0178',
    title: 'Concrete Pour — Pier 12',
    priority: 'High',
    time: '8:00 AM',
  },
  {
    id: 'WO-250521-0172',
    title: 'Rebar Inspection — Abutment 3',
    priority: 'Medium',
    time: '10:00 AM',
  },
  {
    id: 'WO-250521-0181',
    title: 'Storm Drain Installation',
    priority: 'High',
    time: '1:00 PM',
  },
  {
    id: 'WO-250520-0166',
    title: 'Guardrail Replacement',
    priority: 'Low',
    time: 'Tomorrow',
  },
];

export function OperationsDashboard({
  organizationSlug,
}: {
  organizationSlug: string;
}) {
  const [filter, setFilter] = useState('All');
  const [notice, setNotice] = useState('');
  const visibleWork = filter === 'Review' ? [] : work;

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Wednesday, May 21</p>
          <h1>Today’s Operations</h1>
        </div>
        <button
          className="primary"
          type="button"
          onClick={() => setNotice('New work-order form opened')}
        >
          New work order
        </button>
      </section>
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button type="button" onClick={() => setNotice('')}>
            Dismiss
          </button>
        </div>
      )}
      <div className="dashboard-grid">
        <section className="panel work-queue">
          <div className="section-title">
            <h2>
              Work queue <span>18</span>
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
            {visibleWork.map(({ id, title, priority, time }) => (
              <button
                className="work-row"
                type="button"
                key={id}
                onClick={() => setNotice(`${id} selected`)}
              >
                <span className="status-dot" />
                <span>
                  <strong>{id}</strong>
                  <small>{title}</small>
                </span>
                <span className={`priority ${priority.toLowerCase()}`}>
                  {priority}
                </span>
                <time>{time}</time>
              </button>
            ))}
            {visibleWork.length === 0 && (
              <div className="empty-state">
                <strong>No work is waiting for review</strong>
                <span>New submissions will appear here.</span>
              </div>
            )}
          </div>
        </section>
        <aside className="status-stack">
          <SyncConflicts organizationSlug={organizationSlug} />
          <section className="panel">
            <h2>Field deployment</h2>
            <p className="big-number">
              8 <small>teams deployed</small>
            </p>
            <dl>
              <div>
                <dt>On site</dt>
                <dd>6</dd>
              </div>
              <div>
                <dt>En route</dt>
                <dd>1</dd>
              </div>
              <div>
                <dt>At office</dt>
                <dd>1</dd>
              </div>
            </dl>
          </section>
          <section className="panel sync-panel">
            <h2>Offline & sync status</h2>
            <strong>Package v2025.05.21.1</strong>
            <progress max="100" value="100">
              100%
            </progress>
            <span>Available offline until May 24</span>
          </section>
          <section className="panel alerts">
            <h2>
              Alerts <span>3</span>
            </h2>
            <button type="button" onClick={() => setNotice('Conflicts opened')}>
              2 work orders have conflicts
            </button>
            <button type="button" onClick={() => setNotice('Reviews opened')}>
              3 forms pending review
            </button>
          </section>
        </aside>
      </div>
    </>
  );
}
