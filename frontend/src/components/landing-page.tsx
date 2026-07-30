'use client';

import Link from 'next/link';
import { useState } from 'react';

export function LandingPage({ workspaceHref }: { workspaceHref?: string }) {
  const [open, setOpen] = useState(false);
  const appHref = workspaceHref ?? '/sign-up';

  return (
    <main className="landing">
      <nav className="glass landing-nav" aria-label="Main navigation">
        <Link className="brand" href="/">
          FieldPilot
        </Link>
        <button
          className="nav-toggle"
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          Menu
        </button>
        <div className={open ? 'landing-links open' : 'landing-links'}>
          <a href="#platform">Platform</a>
          <a href="#workflow">How it works</a>
          <a href="#proof">Customers</a>
          <a href="#security">Security</a>
        </div>
        <Link className="nav-signin" href={workspaceHref ?? '/sign-in'}>
          {workspaceHref ? 'Open workspace' : 'Sign in'}
        </Link>
      </nav>
      <section className="hero">
        <div className="hero-copy">
          <p className="hero-kicker">Field context platform</p>
          <h1>The operational context layer for field teams.</h1>
          <p className="hero-subtitle">
            Connect projects, sites, crews, assets, forms, dispatch, evidence,
            and reports so office and field teams work from one trusted picture.
          </p>
          <div className="hero-actions">
            <Link className="primary" href={appHref}>
              {workspaceHref ? 'Open workspace' : 'Start your workspace'}
            </Link>
            <a className="secondary" href="#workflow">
              Explore the platform
            </a>
          </div>
          <p className="trust-line">
            Built for construction, infrastructure, utilities, and maintenance.
          </p>
        </div>
        <div
          className="hero-product"
          aria-label="FieldPilot operations preview"
        >
          <div className="context-map-top">
            <span>FieldPilot Cloud</span>
            <strong>Live workspace</strong>
          </div>
          <div className="context-search">
            Search projects, work orders, crews, sites...
          </div>
          <div className="context-layer activation">
            <span>Activation</span>
            <b>Dispatch</b>
            <b>Mobile field app</b>
            <b>Client reports</b>
          </div>
          <div className="context-layer intelligence">
            <span>Operational context</span>
            <b>Projects</b>
            <b>Sites</b>
            <b>Work orders</b>
            <b>Forms</b>
            <b>Assets</b>
          </div>
          <div className="context-layer store">
            <span>System of record</span>
            <b>Audit trail</b>
            <b>Evidence</b>
            <b>Offline packages</b>
            <b>Notifications</b>
          </div>
          <div className="context-map-foot">
            <span>Office</span>
            <span>Field</span>
            <span>Management</span>
          </div>
        </div>
      </section>
      <section
        className="feature-strip"
        id="platform"
        aria-label="Core capabilities"
      >
        <article>
          <strong>Discover the job context</strong>
          <span>
            Search across projects, sites, work, forms, assets, and people.
          </span>
        </article>
        <article>
          <strong>Act from one control tower</strong>
          <span>
            Dispatch, assign, inspect, report, and resolve conflicts in flow.
          </span>
        </article>
        <article>
          <strong>Govern every update</strong>
          <span>
            RBAC, tenant isolation, persisted notifications, and audit history.
          </span>
        </article>
      </section>
      <section className="landing-section" id="workflow">
        <p className="hero-kicker">Built like SaaS, useful like a site diary</p>
        <h2>One graph from project setup to approved evidence.</h2>
        <p>
          FieldPilot turns daily operations into connected context: who owns
          the work, where it happens, what form governs it, which asset it
          touches, and what evidence proves it happened.
        </p>
        <div className="capability-grid">
          {[
            ['01', 'Projects and sites', 'Structure every job before work starts.'],
            ['02', 'Teams and RBAC', 'Give the right people the right controls.'],
            ['03', 'Forms as checklists', 'Attach repeatable field standards to work.'],
            ['04', 'Offline execution', 'Keep crews moving when the network disappears.'],
            ['05', 'Conflict handling', 'Review sync issues before they become silent data loss.'],
            ['06', 'Reports and alerts', 'Keep managers current without chasing WhatsApp threads.'],
          ].map(([number, title, copy]) => (
            <article key={number}>
              <span>{number}</span>
              <strong>{title}</strong>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="proof-band" id="proof" aria-label="Platform coverage">
        <article>
          <strong>Office</strong>
          <span>Planning, assignments, dispatch, members, reports.</span>
        </article>
        <article>
          <strong>Field</strong>
          <span>Today’s work, offline downloads, inspections, conflicts.</span>
        </article>
        <article>
          <strong>Platform</strong>
          <span>Audit logs, notifications, API docs, health checks.</span>
        </article>
      </section>
      <section className="landing-section compact" id="security">
        <p className="hero-kicker">Enterprise foundation</p>
        <h2>Your organization stays in control.</h2>
        <p>
          Tenant isolation, capability-based access, secure sessions, persisted
          notifications, and complete audit history are part of the platform
          foundation.
        </p>
        <Link className="primary" href={appHref}>
          {workspaceHref ? 'Return to dashboard' : 'Create your workspace'}
        </Link>
      </section>
      <footer className="landing-footer">
        <div>
          <Link className="brand" href="/">
            FieldPilot
          </Link>
          <p>
            Offline-first field operations for teams that need the office,
            field, and evidence trail to agree.
          </p>
        </div>
        <nav aria-label="Product">
          <strong>Product</strong>
          <a href="#platform">Platform</a>
          <a href="#workflow">Workflow</a>
          <a href="#security">Security</a>
        </nav>
        <div className="footer-bottom">
          <span>© 2026 FieldPilot</span>
          <span>Built for operationally serious teams.</span>
        </div>
      </footer>
    </main>
  );
}
