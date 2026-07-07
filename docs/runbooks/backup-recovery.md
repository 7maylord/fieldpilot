# Backup and recovery runbook

PostgreSQL requires daily backups and continuous point-in-time recovery with a
5-minute RPO and 60-minute RTO. Workers must recover within 30 minutes and the
API within 60 minutes. S3 versioning is mandatory; Redis is disposable.

For every drill or incident:

1. Record start time, requested recovery point, backup identity, and operator.
2. Restore PostgreSQL into an isolated database/instance, never over production.
3. Select a recovery point no more than five minutes before the simulated loss.
4. Verify migrations, tenant counts/RLS, audit/change/outbox continuity, sync
   checkpoints, critical records, and application readiness.
5. Recover a deleted and overwritten object version; verify its SHA-256 and
   private access policy.
6. Point a non-production API/worker at the restored dependencies and run smoke
   tests. Record measured RPO/RTO and evidence, then destroy drill resources.

Before production migrations, confirm the latest snapshot is restorable. A
backup job marked successful is not recovery evidence until a restore is tested.
