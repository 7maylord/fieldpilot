# ADR 0001: Architecture baseline

- Status: Accepted
- Date: 2026-06-29

## Context

FieldPilot must support office planning and reliable field execution without connectivity. The frontend and backend must remain independently buildable and deployable, while tenant isolation, evidence recovery, synchronization, and auditability are system invariants.

## Decisions

1. Use a monorepo with independently installed `frontend/` and `backend/` applications; each owns its dependencies, lockfile, tooling, tests, and configuration. Do not add shared workspace packages.
2. Use Next.js App Router for the office and field web experiences.
3. Use NestJS with the default Express adapter for the API, worker, and scheduler entry points.
4. Start as a modular monolith; modules communicate through explicit application interfaces or events.
5. Use PostgreSQL as transactional truth and PostGIS for spatial data.
6. Use Prisma for ordinary persistence and parameterized raw SQL for unsupported spatial or advanced queries.
7. Enforce tenant isolation with application authorization plus forced PostgreSQL row-level security under transaction-local organization context.
8. Use IndexedDB through Dexie as the field application's immediate local source of truth.
9. Use a custom checkpointed sync protocol with durable client operations, idempotent push, ordered pull, and domain-specific conflict resolution.
10. Treat Background Sync as optional; foreground retry and the persistent outbox are mandatory.
11. Use Redis and BullMQ for asynchronous work, backed by a transactional PostgreSQL outbox.
12. Store evidence in private S3-compatible object storage using resumable multipart uploads and short-lived signed URLs.
13. Generate the frontend API client from the backend OpenAPI document.
14. Use authenticated, organization-scoped SSE before considering WebSockets.
15. Authorize capabilities in application use cases; frontend visibility is not enforcement.
16. Publish immutable form versions; submissions retain the exact version used.
17. Preserve conflicting evidence and resolve state with entity-specific conflict strategies rather than generic last-write-wins.
18. Use Terraform for reproducible hosted infrastructure.

## Consequences

- Every tenant query, including worker and raw-SQL paths, must use the scoped transaction boundary.
- The field UI reads and writes through offline repositories even when connected.
- Domain mutations, audit records, change-log entries, and outbox events must commit atomically where applicable.
- Sync, queue, form, RLS, and IndexedDB migration behavior require integration or property checks before feature breadth.
- New infrastructure or abstraction requires a demonstrated gap in this baseline.
