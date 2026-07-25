# FieldPilot

Offline-first field operations platform with independently managed Next.js frontend and NestJS/Express backend applications.

## Requirements

- Node.js 22+
- pnpm 10.25+
- Docker Desktop

## Install

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env
pnpm --dir frontend install
pnpm --dir backend install
docker compose up -d
DATABASE_URL=postgresql://fieldpilot:fieldpilot@localhost:5433/fieldpilot pnpm --dir backend prisma:migrate
```

Local services:

- Frontend: http://localhost:3000
- API health: http://localhost:3001/api/v1/health
- API Swagger docs: http://localhost:3001/api/docs
- PostgreSQL/PostGIS: localhost:5433
- Redis: localhost:6379
- MinIO API/console: http://localhost:9000 / http://localhost:9001
- Mailpit SMTP/UI: localhost:1025 / http://localhost:8025

## Develop

```bash
pnpm --dir frontend dev
pnpm --dir backend dev
pnpm --dir backend dev:worker
```

## Verify

```bash
pnpm --dir frontend format:check
pnpm --dir frontend lint
pnpm --dir frontend typecheck
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir frontend exec playwright install chromium
pnpm --dir frontend test:e2e

pnpm --dir backend format:check
pnpm --dir backend lint
pnpm --dir backend typecheck
pnpm --dir backend test
pnpm --dir backend test:integration
pnpm --dir backend build
pnpm --dir backend openapi:check
pnpm --dir frontend api:check
```

## Stop local services

```bash
docker compose down
```

Use `docker compose down -v` only when intentionally deleting local database and object-storage data.

## Troubleshooting

- `command not found: pnpm`: run `corepack enable` and retry.
- Port already in use: stop the conflicting service or change the matching Compose port.
- Docker connection failure: start Docker Desktop and wait until `docker info` succeeds.
- Stale dependencies: remove the affected application's `node_modules`, then install from that application's lockfile.
- Playwright browser missing: run `pnpm --dir frontend exec playwright install chromium`.
