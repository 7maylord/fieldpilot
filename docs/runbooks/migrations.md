# Expand-and-contract migration runbook

1. **Expand:** add nullable columns, new tables/indexes, or parallel APIs. Avoid
   table rewrites and long exclusive locks. Take a snapshot first.
2. **Deploy readers/writers:** release code that understands old and new shapes,
   writes both when required, and still tolerates old workers and offline apps.
3. **Backfill:** run an idempotent, checkpointed background job in small batches;
   monitor replication lag, locks, and errors. It must be safe to stop/retry.
4. **Verify:** compare counts/checksums and exercise old offline payloads before
   switching reads to the new shape.
5. **Contract:** only in a later release after the rollback window and minimum
   client compatibility window. Remove old writes before dropping old data.

Never mutate published form/report history, discard pending IndexedDB
operations, or combine destructive schema changes with the application switch.
Prisma migrations run using the dedicated migration role, not the runtime role.
