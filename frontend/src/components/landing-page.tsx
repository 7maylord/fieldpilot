'use client';

import Link from 'next/link';
import { useState } from 'react';

export function LandingPage() {
  const [open, setOpen] = useState(false);

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
          <a href="#features">Features</a>
          <a href="#workflow">How it works</a>
          <a href="#security">Security</a>
        </div>
        <Link className="nav-signin" href="/sign-in">
          Sign in
        </Link>
      </nav>
      <section className="hero">
        <div className="hero-copy">
          <p className="hero-kicker">Offline-first field operations</p>
          <h1>Keep field work moving, wherever the job takes you.</h1>
          <p className="hero-subtitle">
            Plan work in the office, complete inspections without a connection,
            and bring every update safely back into sync.
          </p>
          <div className="hero-actions">
            <Link className="primary" href="/sign-in">
              Get started
            </Link>
            <a className="secondary" href="#workflow">
              See how it works
            </a>
          </div>
          <p className="trust-line">
            Built for construction, infrastructure, utilities, and maintenance
            teams.
          </p>
        </div>
        <div
          className="hero-product"
          aria-label="FieldPilot operations preview"
        >
          <div className="preview-top">
            <strong>Today’s operations</strong>
            <span>Online</span>
          </div>
          <div className="preview-mode">
            <b>Office</b>
            <span>Field</span>
          </div>
          <div className="preview-stats">
            <div>
              <strong>18</strong>
              <span>Work orders</span>
            </div>
            <div>
              <strong>12</strong>
              <span>Completed</span>
            </div>
            <div>
              <strong>2</strong>
              <span>Conflicts</span>
            </div>
          </div>
          <div className="preview-row">
            <span>Rebar inspection</span>
            <b>10:00 AM</b>
          </div>
          <div className="preview-row">
            <span>Storm drain installation</span>
            <b>1:00 PM</b>
          </div>
          <div className="preview-sync">
            <span>Offline package ready</span>
            <strong>100%</strong>
          </div>
        </div>
      </section>
      <section
        className="feature-strip"
        id="features"
        aria-label="Core capabilities"
      >
        <article>
          <strong>Work offline</strong>
          <span>
            Critical field workflows remain available without a connection.
          </span>
        </article>
        <article>
          <strong>Sync confidently</strong>
          <span>
            Pending work and conflicts stay visible until safely resolved.
          </span>
        </article>
        <article>
          <strong>Keep an audit trail</strong>
          <span>
            Managers retain control, evidence, and operational history.
          </span>
        </article>
      </section>
      <section className="landing-section" id="workflow">
        <p className="hero-kicker">One connected workflow</p>
        <h2>From assignment to approved evidence</h2>
        <p>
          Coordinate teams, dispatch work, capture inspections, and review
          results through one dependable office-and-field experience.
        </p>
        <Link className="primary" href="/sign-in">
          Open FieldPilot
        </Link>
      </section>
      <section className="landing-section compact" id="security">
        <h2>Your organization stays in control.</h2>
        <p>
          Tenant isolation, capability-based access, secure sessions, and
          complete audit history are part of the platform foundation.
        </p>
      </section>
    </main>
  );
}
