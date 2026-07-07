# Rollback runbook

Rollback when health checks fail, error/latency alerts persist, data integrity
is uncertain, or a security boundary regresses.

1. Freeze further releases and name an incident lead.
2. Scale or redeploy the previous ECS task definitions in reverse order:
   frontend, API, scheduler, worker.
3. Do not reverse a database migration unless a tested forward repair is
   impossible. Expanded schemas must remain compatible with the prior release.
4. Pause workers if their behavior could amplify corruption; Redis may be
   rebuilt because it is not authoritative.
5. Re-run smoke tests and watch metrics until the rollback window closes.
6. If data was affected, preserve logs/audit evidence and follow the restore
   runbook. Record timeline, release IDs, decisions, and follow-up owners.

Terraform rollback is a reviewed plan using the prior configuration. Never
restore an old state file over current infrastructure blindly.
