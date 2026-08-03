'use client';

import Link from 'next/link';
import { useState, type CSSProperties } from 'react';
import { BrandMark } from './brand-mark';

/* The six stations are the operational sequence from the product brief, so they
   are numbered the way infrastructure work actually is: by chainage. */
const stations: [string, string, string][] = [
  [
    '0+00',
    'Set up projects and sites',
    'Structure the job before anyone leaves the yard.',
  ],
  [
    '1+00',
    'Assign people and equipment',
    'Match crews, skills, and kit to the work that needs them.',
  ],
  [
    '2+00',
    'Dispatch to the field',
    'Send work with its checklist, site, and asset already attached.',
  ],
  [
    '3+00',
    'Work without a signal',
    'Crews capture readings, photos, and signatures on the device.',
  ],
  [
    '4+00',
    'Reconcile the record',
    'Review conflicts before they turn into silent overwrites.',
  ],
  [
    '5+00',
    'Report and sign off',
    'Publish what happened, with proof of who did it and when.',
  ],
];

export function LandingPage({ workspaceHref }: { workspaceHref?: string }) {
  const [open, setOpen] = useState(false);
  const appHref = workspaceHref ?? '/sign-up';

  return (
    <main className="landing">
      <nav className="landing-nav" aria-label="Main navigation">
        <Link className="brand" href="/">
          <BrandMark />
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
          <a href="#platform">Features</a>
          <a href="#workflow">How it works</a>
          <a href="#proof">Coverage</a>
          <a href="#security">Security</a>
        </div>
        <Link className="nav-signin" href={workspaceHref ?? '/sign-in'}>
          {workspaceHref ? 'Open workspace' : 'Sign in'}
        </Link>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="hero-kicker">Offline-first field operations</p>
          <h1>The field keeps working. The record keeps up.</h1>
          <p className="hero-subtitle">
            FieldPilot runs projects, dispatch, inspections, and evidence for
            crews who lose signal every day. Work continues on the device, and
            every change syncs back with its author, time, and version intact.
          </p>
          <div className="hero-actions">
            <Link className="primary" href={appHref}>
              {workspaceHref ? 'Open workspace' : 'Get started'}
            </Link>
            <a className="secondary" href="#workflow">
              See how sync works
            </a>
          </div>
          <p className="trust-line">
            Construction · Infrastructure · Utilities · Maintenance
          </p>
        </div>

        {/* The thesis: what the server has confirmed, what the device is still
            holding, and the datum between them. */}
        <div className="hero-product" aria-label="Sync status preview">
          <div className="context-map-top">
            <span>Third Mainland Bridge</span>
            <strong>Ikoyi Pier 4</strong>
          </div>
          <div className="context-search">
            Search projects, sites, work orders, crews
          </div>
          <div className="context-layer intelligence">
            <span>Confirmed on the server</span>
            <b>Work order 4182</b>
            <b>Joint inspection v3</b>
            <b>Crew: Lagos QA</b>
            <b>Asset: Bearing P4-3</b>
          </div>
          <div className="context-layer store">
            <span>Held on this device</span>
            <b>6 photos</b>
            <b>Deck level readings</b>
            <b>Defect: spalling at P4-3</b>
            <b>Inspector signature</b>
          </div>
          <div className="context-map-foot">
            <span>Datum 14:32</span>
            <div
              className="datum-rule"
              style={{ '--split': '62%' } as CSSProperties}
              aria-hidden="true"
            >
              <span className="datum-marker" />
            </div>
          </div>
        </div>
      </section>

      <section
        className="feature-strip"
        id="platform"
        aria-label="Core capabilities"
      >
        <article>
          <strong>Find the job in one search</strong>
          <span>
            Projects, sites, work orders, forms, assets, and people are one
            connected record, not six spreadsheets.
          </span>
        </article>
        <article>
          <strong>Dispatch and inspect in flow</strong>
          <span>
            Assign crews and kit, send the checklist with the job, and review
            what came back without leaving the queue.
          </span>
        </article>
        <article>
          <strong>Keep every change attributable</strong>
          <span>
            Role-based access, tenant isolation, and an audit trail that records
            who changed what, on which device, and when.
          </span>
        </article>
      </section>

      <section className="landing-section" id="workflow">
        <p className="hero-kicker">How the work runs</p>
        <h2>From yard setup to signed-off evidence.</h2>
        <p>
          Each stage hands the next one everything it needs: who owns the work,
          where it happens, which form governs it, which asset it touches, and
          what evidence proves it was done.
        </p>
        <div className="capability-grid">
          {stations.map(([station, title, copy]) => (
            <article key={station}>
              <span>{station}</span>
              <strong>{title}</strong>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="proof-band" id="proof" aria-label="Platform coverage">
        <p className="eyebrow">Where it runs</p>
        <article>
          <strong>Office</strong>
          <span>
            Planning, assignments, dispatch, members, maps, and reports.
          </span>
        </article>
        <article>
          <strong>Field</strong>
          <span>
            Today’s work, offline packages, inspections, and conflict review.
          </span>
        </article>
        <article>
          <strong>Platform</strong>
          <span>
            Audit logs, notifications, health checks, and a documented API.
          </span>
        </article>
      </section>

      <section className="landing-section compact" id="security">
        <p className="hero-kicker">Enterprise foundation</p>
        <h2>Your organization stays in control.</h2>
        <p>
          Every workspace is isolated. Access is granted by capability, sessions
          are short-lived, notifications are persisted, and the audit history is
          complete from the first work order onward.
        </p>
        <Link className="primary" href={appHref}>
          {workspaceHref ? 'Return to dashboard' : 'Create your workspace'}
        </Link>
      </section>

      <footer className="landing-footer">
        <div>
          <Link className="brand" href="/">
            <BrandMark />
            FieldPilot
          </Link>
          <p>
            Offline-first field operations for teams that need the office, the
            field, and the evidence trail to agree.
          </p>
        </div>
        <nav aria-label="Product">
          <strong>Product</strong>
          <a href="#platform">Features</a>
          <a href="#workflow">How it works</a>
          <a href="#security">Security</a>
        </nav>
        <div className="footer-bottom">
          <span>© 2026 FieldPilot</span>
          <span>Built for operationally serious teams</span>
        </div>
      </footer>
    </main>
  );
}
