#!/usr/bin/env bash
# Run the production image against a disposable database. No host ports or volumes are used.
set -euo pipefail
image="${1:?Usage: bash scripts/test-docker.sh IMAGE}"
run_id="sniptide-test-$(date +%s)-$$"
network="$run_id"
database="$run_id-db"
app="$run_id-app"

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    docker logs "$database" || true
    docker logs "$app" || true
  fi
  docker rm -fv "$app" "$database" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

docker network create "$network" >/dev/null
docker run -d --name "$database" --network "$network" --network-alias db \
  -e POSTGRES_USER=sniptide -e POSTGRES_PASSWORD=sniptide -e POSTGRES_DB=sniptide \
  postgres:17-alpine >/dev/null

wait_for_database() {
  for ((attempt = 0; attempt < 60; attempt++)); do
    if docker exec "$database" pg_isready -h 127.0.0.1 -U sniptide -d sniptide >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done
  echo 'Postgres did not start' >&2
  return 1
}
wait_for_app() {
  for ((attempt = 0; attempt < 90; attempt++)); do
    if docker exec "$app" node -e \
      "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))" \
      >/dev/null 2>&1; then
      return
    fi
    if [ "$(docker inspect --format '{{.State.Running}}' "$app")" != true ]; then
      break
    fi
    sleep 1
  done
  echo 'Sniptide did not become healthy' >&2
  return 1
}

wait_for_database
# DATABASE_URL and the auth secret are all the app needs to boot. BETTER_AUTH_URL is what lets
# browsers sign in (the auth origin check compares against it), so the sign-up below needs it.
docker run -d --name "$app" --network "$network" \
  -e DATABASE_URL=postgres://sniptide:sniptide@db:5432/sniptide \
  -e BETTER_AUTH_SECRET=docker-smoke-test-secret-at-least-32-characters \
  -e BETTER_AUTH_URL=http://localhost:3000 \
  "$image" >/dev/null
wait_for_app

# Check a rendered page, the copied static assets and a write through the migrated auth schema.
docker exec -i "$app" node --input-type=module <<'JS'
import assert from 'node:assert/strict';
const origin = 'http://localhost:3000';
const page = await fetch(`${origin}/sign-in`);
assert.equal(page.status, 200);
const html = await page.text();
const asset = html.match(/src="([^" ]+\/_next\/static\/[^" ]+)"/)?.[1]
  ?? html.match(/src="(\/_next\/static\/[^" ]+)"/)?.[1];
assert.ok(asset, 'sign-in page should reference a static script');
assert.equal((await fetch(new URL(asset.replaceAll('&amp;', '&'), origin))).status, 200);
const response = await fetch(`${origin}/api/auth/sign-up/email`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: origin },
  body: JSON.stringify({ name: 'Docker test', username: 'docker-test', email: 'docker-test@example.com', password: 'test-password-12345' }),
});
const data = await response.json();
assert.equal(response.status, 200, JSON.stringify(data));
assert.equal(data.user.email, 'docker-test@example.com');
JS

# A restart must preserve the account and safely reapply startup migrations.
docker restart "$app" >/dev/null
wait_for_app
count=$(docker exec "$database" psql -U sniptide -d sniptide -Atc \
  "SELECT count(*) FROM public.\"user\" WHERE email = 'docker-test@example.com'")
[ "$count" = 1 ]
echo 'Docker startup, migrations, assets, sign-up and restart passed.'
