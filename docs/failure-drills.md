# Failure drills

Run `bash infrastructure/scripts/failure-drill.sh` to verify Redis, object-storage, and PostgreSQL outages are observable and every container is restored healthy by the script's exit trap.

Additional automated evidence:

- BullMQ retries a failed job five times and moves the terminal failure to its dead-letter queue.
- Stable job IDs and database `runOnce` keys prevent duplicate processing after worker restart.
- Structured offline work remains in IndexedDB while media storage is unavailable.
- Playwright proves a failed service-worker update leaves the previous cached field shell usable.
- Readiness checks fail when PostgreSQL or Redis is unavailable; liveness remains process-only.
