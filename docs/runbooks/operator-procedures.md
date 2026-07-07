# Operator procedures

## Daily

- Check API/dependency alerts, failed/dead-letter jobs, backup status, storage
  capacity, certificate expiry, and security findings.
- Triage quarantined media and client-failure spikes without viewing tenant
  content unless support authorization permits it.

## Queue recovery

Confirm the dependency is healthy and the handler remains idempotent. Inspect
the dead-letter reason and correlation ID, repair the cause, then replay one job
before a bounded batch. Verify domain/audit state; never bulk-retry blindly.

## Device or membership compromise

Revoke membership/session/device, request device purge, preserve unsynced work
in quarantine, rotate exposed credentials, and verify subsequent sync is denied.

## Media quarantine

Keep objects private. Review scanner status and hashes, never download suspected
content to an unmanaged workstation, and only release through the authorized
media state transition. Audit every decision.

## Restore

Follow `backup-recovery.md`; restore into an isolated target first. Validate
tenant isolation and application invariants before traffic is switched.
