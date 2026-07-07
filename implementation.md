# FieldPilot Implementation Checklist

This checklist is the execution order for the initial FieldPilot build. It is derived from `fieldpilot-prd.md` and `fieldpilot-trd.md`.

## How to use this file

- Work from top to bottom unless a task explicitly says it can run in parallel.
- Change `- [ ]` to `- [x]` only after the task's verification is complete.
- Do not mark partially completed tasks as complete. Add indented follow-up boxes when work remains.
- Keep implementation changes scoped to the active task.
- Record architecture decisions in `docs/adr/` before implementing the affected subsystem.
- A feature is not complete without authorization, tenant isolation, offline and sync behavior where applicable, tests, observability, API documentation, accessibility, and security review.

## Phase 0 — Decisions and risk-reduction spikes

- [x] Resolve the Git worktree/repository setup and establish the default branch and ignore rules.
- [x] Confirm the MVP pilot slice: organization → project/site → work order → offline inspection → sync → review.
  - Decision: this vertical slice is the first delivery boundary; broader modules do not block it.
- [x] Resolve the PRD contradiction by deciding whether resumable media uploads are mandatory for MVP launch.
  - Decision: resumable uploads are required for launch because offline evidence recovery is a launch criterion.
- [x] Define the offline authentication, package-expiry, membership-revocation, logout, quarantine, and recovery-export rules.
  - A valid downloaded package remains readable offline until its signed expiry; offline actions require the package to be unexpired when they occur.
  - Logout, membership revocation, remote revoke, or package expiry blocks new work and requests a purge on the next trusted server contact.
  - Unsynced work is never purged automatically. It moves to a read-only quarantine until synchronization, authorized recovery export, or explicit user-confirmed deletion.
  - Recovery exports contain unsynced operations and local media metadata/files, are encrypted by the platform where available, and require reauthentication when online.
  - The server remains authoritative for membership and permission decisions; device time is evidence, not authorization truth.
- [x] Define ownership and retention boundaries for audit events, entity change logs, sync operations, idempotency records, and transactional outbox events.
  - Audit events are the immutable human/security history and follow the organization's audit-retention policy.
  - Entity change logs exist only for incremental sync and may be compacted after all active-device checkpoints and the recovery window have advanced.
  - Sync operations own per-device execution results and conflicts; applied payloads may be minimized after the retry/recovery window, while unresolved conflicts remain.
  - Idempotency records own replay safety and must outlive the maximum client retry/offline window.
  - Outbox events own delivery, not business history; delivered events may be removed after the operational replay window, while dead letters remain until resolved.
  - Exact durations are deployment policy, not application constants; deletion must preserve legal holds, unresolved work, and referential audit evidence.
- [x] Write the required initial ADRs for the monorepo, Next.js, NestJS/Express, modular monolith, PostgreSQL/PostGIS, Prisma, RLS, Dexie, custom sync, BullMQ, multipart uploads, OpenAPI, SSE, form immutability, conflict resolution, and transactional outbox.
- [x] Prove transaction-local PostgreSQL RLS works safely through Prisma, including workers and raw SQL.
  - Verified by `spikes/prisma-rls`: fail-closed access, API and worker tenant scope, parameterized raw SQL, cross-tenant write rejection, and transaction-local context cleanup.
- [x] Prove a Dexie transaction can atomically update an entity and enqueue its pending sync operation.
  - Verified by `spikes/dexie-outbox`: entity and operation commit together, and both roll back on failure.
- [x] Prove checkpointed push/pull sync is idempotent under duplicate delivery, browser restart, multiple tabs, and multiple devices.
  - Verified by `spikes/sync-protocol`: durable checkpoints, duplicate replay, shared multi-tab locking, restart persistence, and device-scoped idempotency.
- [x] Prove multipart media upload can resume without duplicating or overwriting evidence.
  - Verified by `spikes/multipart-upload`: interrupted upload resume, part uniqueness, SHA-256 integrity, single-object storage, and immutable-key rejection against MinIO.

## Phase 1 — Monorepo and development foundation

- [x] Create independently installable and buildable `frontend/` and `backend/` applications.
- [x] Keep TypeScript, ESLint, Prettier, dependencies, lockfiles, scripts, and tests local to each application.
- [x] Avoid shared workspace packages; OpenAPI is the frontend/backend contract boundary.
- [x] Add `docs/adr/`, `infrastructure/`, and CI workflow directories.
- [x] Add Docker Compose services for PostgreSQL/PostGIS, Redis, MinIO, and Mailpit.
- [x] Scaffold the Next.js App Router frontend with `(auth)`, `(office)`, and `(field)` route groups.
- [x] Scaffold the NestJS/Express backend with API, worker, and scheduler entry points.
- [x] Add unit, integration, and Playwright test harnesses.
- [x] Add CI checks for format, lint, type checking, unit tests, integration tests, Prisma validation, migrations, builds, OpenAPI drift, dependency audit, secret scanning, and accessibility smoke tests.
- [x] Document clean local installation, startup, testing, and troubleshooting in `README.md`.

## Phase 2 — Backend platform and tenancy

- [x] Implement typed configuration with startup validation and secret-safe logging.
- [x] Implement structured logging, request IDs, RFC 7807 errors, OpenAPI, health/readiness checks, telemetry hooks, and graceful shutdown.
- [x] Establish Prisma migrations, UUID/timestamp/version conventions, PostGIS, and separate runtime and migration roles.
- [x] Implement the mandatory organization-scoped transaction and repository wrapper.
- [x] Enable and force RLS on every tenant table, with fail-closed integration tests.
- [x] Implement user registration, verification, password reset, Argon2id hashing, secure cookie sessions, rotation, revocation, CSRF protection, and rate limiting.
- [x] Implement organizations, invitations, memberships, teams, project access, and external-user restrictions.
- [x] Implement capability-based authorization in application use cases.
- [x] Implement append-only audit writing and the transactional outbox.
- [x] Implement Redis/BullMQ foundations with idempotent processing, retry policy, dead-letter handling, throttling, metrics, and graceful shutdown.
- [x] Generate the frontend client from backend OpenAPI and make contract drift fail CI.

## Phase 3 — Frontend shells and local platform

- [x] Build accessible authentication, organization selection, office navigation, field navigation, loading, empty, not-found, and error states.
- [x] Configure TanStack Query for remote state, Zustand for limited UI state, React Hook Form, and Zod.
- [x] Create the versioned Dexie schema, typed offline repositories, download manifests, checkpoints, tombstones, and pending operations.
- [x] Implement entity-plus-outbox atomic local mutations.
- [x] Implement IndexedDB migrations that preserve pending operations and test old snapshots.
- [x] Implement single-tab sync locking with safe multi-tab coordination.
- [x] Add the PWA manifest, offline shell, versioned caches, safe service-worker activation, and update notification.
- [x] Add visible connectivity, download-package, pending-work, media-upload, and conflict states.
- [x] Implement local recovery export and storage-pressure handling that prioritizes unsynced structured work.

## Phase 4 — First online domain slice

- [x] Implement projects with timezone, status, archive behavior, and tenant-scoped access.
- [x] Implement sites and hierarchical locations with PostGIS geometry and bounded viewport queries.
- [x] Implement work orders, assignments, dependencies, evidence requirements, optimistic versions, and centralized state transitions.
- [x] Implement the office project, site, work-order, and assignment screens.
- [x] Implement the field Today and My Work views through offline repositories, including while online.
- [x] Add audit, authorization, tenant-isolation, state-machine, API, and accessibility tests for the slice.

## Phase 5 — Offline synchronization

- [x] Implement device registration, revocation, app-version tracking, package expiry, and purge requests.
- [x] Implement authorized sync bootstrap with an opaque checkpoint and transactional IndexedDB import.
- [x] Implement durable client operation IDs, base versions, timestamps, retry state, and priority ordering.
- [x] Implement idempotent sync push with per-operation applied, auto-merged, conflict, rejected, and already-applied results.
- [x] Implement monotonic entity change logging and paginated checkpointed pull.
- [x] Implement comment append, media append, checklist-field merge, status-transition, assignment, defect, asset, and form-submission conflict strategies.
- [x] Implement conflict persistence, recovery, coordinator resolution UI, and complete audit history.
- [x] Verify offline reload, slow network, partial sync, duplicate retry, bad device clock, browser crash, multiple tabs, multiple devices, revocation, and package expiry.

## Phase 6 — Forms, inspections, and media

- [x] Define a constrained, versioned form schema and shared client/server conformance fixtures.
- [x] Implement form-template drafts, schema validation, publication, immutable versions, duplication, and version comparison.
- [x] Implement deterministic conditional visibility, required fields, calculations, tolerances, and evidence rules on client and server.
- [x] Build the office form editor and preview without expanding beyond the approved schema.
- [x] Build the offline field form renderer and durable inspection drafts.
- [x] Implement inspection creation, submission, review, rejection, clarification, approval, and exact form-version references.
- [x] Implement offline photo and signature capture, SHA-256 hashing, thumbnails, compression, and local media records.
- [x] Implement private multipart uploads, signed URLs, resume, integrity verification, malware scanning, derivatives, quarantine, and immutable evidence links.
- [x] Verify that rejected state transitions never discard valid evidence.

## Phase 7 — Operations modules

- [x] Implement scheduling conflict checks for workers, teams, equipment, skills, access, dependencies, shifts, and travel feasibility.
- [x] Build dispatch calendar/resource views, unassigned work, assignment warnings, and recommendations without autonomous optimization.
- [x] Implement in-app and email notifications through the transactional outbox.
- [x] Implement authenticated organization-scoped SSE with heartbeat, replay, revocation, and polling fallback.
- [x] Implement defect lifecycle, assignment, correction evidence, verification, closure, rejection, and reopening.
- [x] Implement assets, asset types, QR lookup, location, inspection/defect history, and meter readings.
- [x] Implement revisioned daily-report drafts, review, signatures, publication, and source references.
- [x] Implement PDF/CSV output only after its MVP priority is confirmed.

## Phase 8 — Production hardening and pilot

- [x] Pass cross-tenant, IDOR, CSRF, XSS, injection, signed-URL, malicious-file, revoked-session, revoked-membership, and rate-limit tests.
- [x] Pass property tests for sync replay, merge invariants, form rules, state transitions, permissions, and checkpoint monotonicity.
- [x] Meet API, sync, dashboard, SSE, upload-session, report-generation, and cached-field-UI performance targets.
- [x] Test queue retries, dead-letter recovery, Redis outage, storage outage, PostgreSQL outage, worker crash, and service-worker update failure.
- [x] Complete WCAG 2.2 AA review for core office and field workflows.
- [x] Add dashboards and alerts for HTTP, database, Redis, queues, sync, conflicts, media, reports, SSE, and client failures.
- [x] Implement Terraform and isolated development, test, staging, and production environments.
- [x] Document deployment, expand-and-contract migrations, rollback, incident response, retention, deletion, and operator procedures.
- [x] Perform backup, point-in-time recovery, object recovery, and restore drills against the stated RPO/RTO targets.
- [x] Run the complete Playwright journey from registration through offline inspection, synchronization, review, defect closure, and report publication.
- [x] Verify every PRD launch criterion and record pilot sign-off.

## Completion rule

A phase is complete only when every box in that phase is checked and its evidence—tests, ADRs, documentation, or operational verification—is committed alongside the implementation.
