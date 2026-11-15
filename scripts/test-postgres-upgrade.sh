#!/usr/bin/env bash
# Exercise the 17 volume guard, dump/restore to 18, restart, and rollback.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
dir=$(mktemp -d)
export COMPOSE_PROJECT_NAME="sniptide-pg-upgrade-$$"
export BETTER_AUTH_SECRET="postgres-upgrade-test-secret-at-least-32-characters"
export POSTGRES_PORT=0
cleanup() {
  status=$?
  docker compose -f "$dir/old.yml" -f "$dir/new.yml" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$dir"
  exit "$status"
}
trap cleanup EXIT
cat > "$dir/old.yml" <<'YAML'
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: sniptide
      POSTGRES_PASSWORD: sniptide
      POSTGRES_DB: sniptide
    volumes:
      - postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sniptide -d sniptide"]
      interval: 1s
      timeout: 3s
      retries: 30
volumes:
  postgres:
YAML
cp "$root/docker-compose.yml" "$dir/new.yml"
old=(docker compose -f "$dir/old.yml")
new=(docker compose -f "$dir/new.yml")
"${old[@]}" up -d --wait db
"${old[@]}" exec -T db psql -U sniptide -d sniptide -v ON_ERROR_STOP=1 -c "CREATE TABLE probe (value text); INSERT INTO probe VALUES ('retained');"
"${old[@]}" exec -T db pg_dump -U sniptide -d sniptide --format=custom --no-owner --no-privileges > "$dir/backup.dump"
"${old[@]}" down
# The new template must reject the old volume, not initialize an empty cluster.
"${new[@]}" up -d db
container=$("${new[@]}" ps -aq db)
for attempt in {1..30}; do
  if docker logs "$container" 2>&1 | grep -q 'PostgreSQL 17 data detected'; then break; fi
  sleep 1
done
docker logs "$container" 2>&1 | grep -q 'PostgreSQL 17 data detected'
"${new[@]}" down
# Match the documented switch to a new volume.
export POSTGRES_VOLUME=postgres18
"${new[@]}" up -d --wait db
"${new[@]}" exec -T db pg_restore -U sniptide -d sniptide --no-owner --no-privileges --exit-on-error < "$dir/backup.dump"
"${new[@]}" restart db
"${new[@]}" up -d --wait db
[ "$("${new[@]}" exec -T db psql -U sniptide -d sniptide -Atc 'SELECT value FROM probe')" = retained ]
"${new[@]}" down
"${old[@]}" up -d --wait db
[ "$("${old[@]}" exec -T db psql -U sniptide -d sniptide -Atc 'SELECT value FROM probe')" = retained ]
echo 'Postgres 17 guard, 18 restore, restart and rollback passed.'
