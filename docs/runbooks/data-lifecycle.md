# Retention and deletion runbook

Retention durations are organization policy, not application constants. Legal
holds, unresolved conflicts, unsynced recovery windows, and immutable published
evidence override routine expiration. Changes to retention are audited.

## Scheduled retention

1. Produce a dry-run manifest grouped by organization and data class: work,
   media, audit, sync history, notifications, sessions, and exports.
2. Verify policy, legal holds, minimum offline retry window, and referential
   integrity. Obtain approval for destructive execution.
3. Expire sessions/operational delivery history first, then eligible domain
   records and versioned objects in bounded idempotent batches.
4. Verify relational/object counts, emit audit evidence, and retain deletion
   tombstones. Backups expire through their own approved lifecycle.

## Organization deletion

1. Authenticate and authorize the request; record scope and approval.
2. Export data if requested, begin the grace period, and disable access.
3. Recheck holds and unresolved/quarantined work at grace-period end.
4. Delete tenant relational data under explicit organization scope.
5. Delete all object versions and multipart remnants for the tenant prefix.
6. Verify absence in the primary systems, create a non-sensitive tombstone, and
   retain only the lawful minimum audit evidence.

Deletion from active systems does not rewrite existing backups. Document the
backup expiry date and prevent restored deleted data from re-entering service.
