# Pilot sign-off

Date: 2026-07-07  
Environment: local Docker isolation

## Result

Signed off for pilot launch after mapping every PRD launch criterion to runnable
or documented evidence.

| PRD launch criterion | Sign-off evidence |
| --- | --- |
| Clean installation works. | `docker compose ps` showed Postgres, Redis, MinIO, ClamAV, Mailpit, Prometheus, and Grafana running; configured health checks were healthy. Deployment and migration steps are documented in `docs/runbooks/deployment.md` and `docs/runbooks/migrations.md`. |
| Organization, project, and work order can be created. | `backend/test/integration/platform.test.ts` and `frontend/tests/e2e/launch-journey.spec.ts` create a registered tenant, project, site/location, and work order. |
| Worker can complete work offline and synchronize. | `frontend/tests/e2e/launch-journey.spec.ts` completes an inspection offline, queues it in IndexedDB, returns online, and pushes the operation through sync. |
| Conflicts preserve evidence. | `backend/test/integration/platform.test.ts` creates a stale offline update, records a sync conflict, preserves the client timestamp, resolves it, and emits a conflict-resolution change. |
| Media upload resumes. | `backend/test/integration/platform.test.ts` starts uploads, resumes upload sessions by ID, completes originals and thumbnails, and verifies immutable ready media. |
| Form versions are immutable. | `backend/test/integration/platform.test.ts` rejects direct schema tampering on a published form version and compares a later draft as a new version. |
| Tenant isolation tests pass. | `backend/test/integration/platform.test.ts` verifies force-RLS on tenant tables and cross-tenant invisibility for Prisma and raw SQL. |
| Illegal state transitions fail. | `backend/src/work-orders/work-order-state.test.ts`, `backend/src/defects/defect-state.test.ts`, and integration conflict checks reject invalid or stale transitions. |
| Reports generate. | `backend/test/integration/platform.test.ts` publishes a signed daily report and exports PDF and CSV; `frontend/tests/e2e/launch-journey.spec.ts` publishes the pilot report. |
| Backup and restore are tested. | `docs/recovery-drill-results.md` records PostgreSQL PITR and MinIO object recovery passing local RPO/RTO targets. |
| Queue retries do not duplicate state. | `backend/test/integration/platform.test.ts` verifies stable job IDs, retry-to-dead-letter behavior, and outbox publication. |
| Audit events cover critical actions. | `backend/test/integration/platform.test.ts` asserts audit events for project, work order, sync, conflict, and immutable audit protection. |
| Core workflows pass accessibility review. | `docs/accessibility-review.md` records WCAG 2.2 AA review; `frontend/tests/e2e/accessibility-audit.spec.ts` and `accessibility-smoke.spec.ts` provide executable evidence. |
| Deployment and rollback are documented. | `docs/runbooks/deployment.md`, `docs/runbooks/rollback.md`, `docs/runbooks/migrations.md`, `docs/runbooks/incident-response.md`, and `docs/runbooks/operator-procedures.md`. |

## Verification commands

- `docker compose ps` — passed on 2026-07-07.
- `pnpm exec vitest run test/integration/platform.test.ts` — passed 6/6 on 2026-07-07.
- `pnpm exec playwright test tests/e2e/launch-journey.spec.ts --reporter=line` — passed 1/1 on 2026-07-07.
