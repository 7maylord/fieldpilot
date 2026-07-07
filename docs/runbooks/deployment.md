# Deployment runbook

## Preconditions

- CI is green, images are signed and addressed by digest, and release notes are approved.
- The target Terraform plan contains no unexpected replacement or deletion.
- PostgreSQL automated backups are healthy and a pre-migration snapshot exists.
- The migration plan identifies expand, backfill, switch, and contract releases.
- The on-call operator, rollback owner, and observation window are named.

## Deploy

1. Apply Terraform changes to development, test, staging, then production using
   that environment's remote state and tfvars.
2. Push frontend and backend images, register task definitions using immutable
   digests, and keep the previous task definitions available.
3. Run only backward-compatible expand migrations with the migration role.
4. Deploy the worker and scheduler, then API, then frontend as rolling ECS
   updates. Wait for healthy targets and stable services after each component.
5. Smoke-test health/readiness, authentication, tenant isolation, sync,
   multipart upload, queue processing, SSE, and report generation.
6. Watch alerts, error rate, p95 latency, queue depth, sync failures, and client
   failures for the approved observation window. Record the release and checks.

Never expose `/api/v1/metrics`, PostgreSQL, or Redis through public ingress.
Production DNS must terminate TLS before serving users; the Terraform HTTP
listener is a bootstrap endpoint, not approval to launch plaintext traffic.
