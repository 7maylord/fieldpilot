#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

restore() {
  docker compose up -d postgres redis minio >/dev/null
}
trap restore EXIT

docker compose up -d postgres redis minio >/dev/null

docker compose stop redis >/dev/null
if docker compose exec -T redis redis-cli ping >/dev/null 2>&1; then
  echo "Redis outage drill failed" >&2
  exit 1
fi
docker compose start redis >/dev/null

docker compose stop minio >/dev/null
if curl --fail --silent --max-time 2 http://localhost:9000/minio/health/live >/dev/null; then
  echo "Storage outage drill failed" >&2
  exit 1
fi
docker compose start minio >/dev/null

docker compose stop postgres >/dev/null
if pg_isready -h localhost -p 5433 >/dev/null 2>&1; then
  echo "PostgreSQL outage drill failed" >&2
  exit 1
fi
docker compose start postgres >/dev/null

docker compose up -d --wait postgres redis minio >/dev/null
echo "Redis, storage, and PostgreSQL outage drills passed; all services restored."
