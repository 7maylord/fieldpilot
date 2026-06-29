# Prisma RLS spike

This proves that PostgreSQL row-level security works through Prisma for API-style repositories, worker-style repositories, and parameterized raw SQL. It also verifies fail-closed access, cross-tenant write rejection, and transaction-local context cleanup.

```bash
docker compose up -d --wait
pnpm install
DATABASE_URL=postgresql://app_runtime:runtime@localhost:55432/fieldpilot_rls pnpm generate
DATABASE_URL=postgresql://app_runtime:runtime@localhost:55432/fieldpilot_rls pnpm check
docker compose down -v
```
