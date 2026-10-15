#!/usr/bin/env bash
# Run the self-hosting setups against a built image: docker-compose.yml as a self-hoster would
# (`docker compose up -d`) and the Coolify template with the values Coolify would fill in.
set -euo pipefail
image="${1:?Usage: bash scripts/test-compose.sh IMAGE}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d)"
cd "$root"
export SNIPTIDE_IMAGE="$image" SNIPTIDE_PORT=3987 POSTGRES_PORT=55987
export BETTER_AUTH_SECRET="compose-smoke-test-secret-at-least-32-characters"

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    docker compose -p sniptide-compose-test logs || true
    docker compose -p sniptide-template-test -f "$work/coolify.yaml" logs || true
  fi
  docker compose -p sniptide-compose-test down -v >/dev/null 2>&1 || true
  docker compose -p sniptide-template-test -f "$work/coolify.yaml" down -v >/dev/null 2>&1 || true
  rm -rf "$work"
  exit "$status"
}
trap cleanup EXIT

# 1. docker-compose.yml with only the secret set, as in the README.
docker compose -p sniptide-compose-test up -d --no-build --wait --wait-timeout 180
curl -fsS http://127.0.0.1:3987/api/health >/dev/null
test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3987/sign-up)" = 200
# The optional HTTPS proxy needs a domain and is only checked for a valid definition here.
SNIPTIDE_DOMAIN=paste.example.com docker compose --profile proxy config -q
docker compose -p sniptide-compose-test down -v
echo 'docker-compose.yml: app and database came up healthy.'

# 2. The Coolify template, using the image under test and the variables Coolify generates.
sed "s|ghcr.io/dino-kupinic/sniptide:latest|$image|" deploy/coolify/sniptide.yaml >"$work/coolify.yaml"
export SERVICE_USER_POSTGRES=sniptide SERVICE_PASSWORD_POSTGRES=templatepassword123
export SERVICE_BASE64_64_SNIPTIDE="template-smoke-test-secret-at-least-32-characters"
export SERVICE_URL_SNIPTIDE=https://paste.example.com
docker compose -p sniptide-template-test -f "$work/coolify.yaml" up -d --wait --wait-timeout 180
docker compose -p sniptide-template-test -f "$work/coolify.yaml" exec -T sniptide node -e \
  "fetch('http://127.0.0.1:3000/sign-in').then(r => process.exit(r.status === 200 ? 0 : 1)).catch(() => process.exit(1))"
echo 'Coolify template: app and database came up healthy.'
