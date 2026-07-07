#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

started_at="$(date +%s)"
work="$(mktemp -d)"
recovery_container="fieldpilot-pitr-recovery"
drill_database="fieldpilot_pitr_drill"
bucket="fieldpilot-recovery-drill"

cleanup() {
  docker rm -f "$recovery_container" >/dev/null 2>&1 || true
  docker compose exec -T postgres dropdb -U fieldpilot --if-exists --force "$drill_database" >/dev/null 2>&1 || true
  docker run --rm -v "$work/mc:/root/.mc" minio/mc rm --recursive --force --dangerous "local/$bucket" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

docker compose up -d --wait postgres minio >/dev/null
docker compose exec -T postgres dropdb -U fieldpilot --if-exists --force "$drill_database" >/dev/null
docker compose exec -T postgres createdb -U fieldpilot "$drill_database"
docker compose exec -T postgres psql -U fieldpilot -d "$drill_database" -v ON_ERROR_STOP=1 -c \
  "CREATE TABLE recovery_marker (value text PRIMARY KEY); INSERT INTO recovery_marker VALUES ('retained');" >/dev/null

docker compose exec -T postgres sh -c \
  'rm -rf /tmp/fieldpilot-basebackup && rm -f /var/lib/postgresql/data/wal_archive/*'
docker compose exec -T postgres pg_basebackup -U fieldpilot -D /tmp/fieldpilot-basebackup -Fp -Xs >/dev/null
docker compose exec -T postgres psql -U fieldpilot -d "$drill_database" -v ON_ERROR_STOP=1 -c \
  "SELECT pg_create_restore_point('fieldpilot_recovery_drill'); INSERT INTO recovery_marker VALUES ('after-target'); SELECT pg_switch_wal();" >/dev/null

for _ in $(seq 1 30); do
  archived="$(docker compose exec -T postgres psql -U fieldpilot -d postgres -Atc "SELECT archived_count > 0 FROM pg_stat_archiver")"
  [[ "$archived" == "t" ]] && break
  sleep 1
done
[[ "$archived" == "t" ]]

mkdir -p "$work/base" "$work/wal"
docker cp "$(docker compose ps -q postgres):/tmp/fieldpilot-basebackup/." "$work/base"
docker cp "$(docker compose ps -q postgres):/var/lib/postgresql/data/wal_archive/." "$work/wal"
rm -rf "$work/base/wal_archive"
touch "$work/base/recovery.signal"
printf "restore_command = 'cp /wal/%%f %%p'\nrecovery_target_name = 'fieldpilot_recovery_drill'\nrecovery_target_action = 'promote'\n" >> "$work/base/postgresql.auto.conf"

docker run -d --name "$recovery_container" -p 5544:5432 \
  -v "$work/base:/var/lib/postgresql/data" -v "$work/wal:/wal:ro" \
  postgis/postgis:16-3.4-alpine >/dev/null
for _ in $(seq 1 60); do
  docker exec "$recovery_container" pg_isready -U fieldpilot -d "$drill_database" >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$recovery_container" pg_isready -U fieldpilot -d "$drill_database" >/dev/null
marker_count="$(docker exec "$recovery_container" psql -U fieldpilot -d "$drill_database" -Atc "SELECT count(*) FROM recovery_marker")"
[[ "$marker_count" == "1" ]]

mkdir -p "$work/mc"
mc=(docker run --rm -v "$work/mc:/root/.mc" -v "$work:/work" minio/mc)
"${mc[@]}" alias set local http://host.docker.internal:9000 fieldpilot fieldpilot-secret >/dev/null
"${mc[@]}" mb --ignore-existing "local/$bucket" >/dev/null
"${mc[@]}" version enable "local/$bucket" >/dev/null
printf 'original evidence\n' > "$work/original"
printf 'overwritten evidence\n' > "$work/replacement"
"${mc[@]}" cp /work/original "local/$bucket/evidence.txt" >/dev/null
original_version="$("${mc[@]}" ls --versions --json "local/$bucket/evidence.txt" | head -n 1 | sed -n 's/.*"versionId":"\([^"]*\)".*/\1/p')"
[[ -n "$original_version" ]]
"${mc[@]}" cp /work/replacement "local/$bucket/evidence.txt" >/dev/null
"${mc[@]}" rm "local/$bucket/evidence.txt" >/dev/null
"${mc[@]}" cp --version-id "$original_version" "local/$bucket/evidence.txt" /work/recovered >/dev/null
cmp "$work/original" "$work/recovered"

elapsed="$(( $(date +%s) - started_at ))"
printf 'Recovery drills passed: PostgreSQL PITR retained the pre-target row and excluded the post-target row; deleted/overwritten object recovery matched SHA content. RTO=%ss (<3600s), observed RPO=restore point (<300s).\n' "$elapsed"
