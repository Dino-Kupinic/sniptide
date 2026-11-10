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
    (cd "$work/install" 2>/dev/null && docker compose logs) || true
  fi
  docker compose -p sniptide-compose-test down -v >/dev/null 2>&1 || true
  docker compose -p sniptide-template-test -f "$work/coolify.yaml" down -v >/dev/null 2>&1 || true
  (cd "$work/install" 2>/dev/null && docker compose down -v >/dev/null 2>&1) || true
  docker volume rm sniptide-install-reuse_postgres >/dev/null 2>&1 || true
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

# 2. The install script, on plain HTTP with the files from this checkout. Sign-up closes after the
# first account (ALLOW_SIGN_UP=first), and a domain derives the HTTPS settings.
SNIPTIDE_SOURCE_URL="file://$root" SNIPTIDE_REF=test sh scripts/install.sh --yes --dir "$work/install"
(
  cd "$work/install"
  test "$(stat -c %a .env)" = 600
  grep -q '^ALLOW_SIGN_UP=first$' .env
  sign_up() {
    curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:3987/api/auth/sign-up/email \
      -H 'content-type: application/json' -H "origin: $(sed -n 's/^BETTER_AUTH_URL=//p' .env)" \
      -d "{\"email\":\"$1@example.com\",\"password\":\"long-enough-password\",\"name\":\"$1\",\"username\":\"$1\"}"
  }
  test "$(sign_up ada)" = 200
  test "$(sign_up eve)" = 403
  docker compose down -v
)
SNIPTIDE_DOMAIN=paste.example.com docker compose --env-file /dev/null config --format json \
  >"$work/derived.json"
grep -q '"BETTER_AUTH_URL": "https://paste.example.com"' "$work/derived.json"
grep -q '"CLIENT_IP_SOURCE": "x-forwarded-for"' "$work/derived.json"
grep -q '"TRUSTED_PROXIES": "private"' "$work/derived.json"
echo 'Install script: app came up healthy, and sign-up closed after the first account.'

# A database volume left under the same project name keeps its old password, so a fresh install
# refuses to start against it and names the volume instead of timing out on an unhealthy app.
docker volume create sniptide-install-reuse_postgres >/dev/null
if SNIPTIDE_SOURCE_URL="file://$root" SNIPTIDE_REF=test sh scripts/install.sh --yes \
  --dir "$work/sniptide-install-reuse" 2>"$work/reuse.err"; then
  echo 'Install script started over an existing database volume.' >&2
  exit 1
fi
docker volume rm sniptide-install-reuse_postgres >/dev/null
grep -q 'sniptide-install-reuse_postgres' "$work/reuse.err"
test ! -e "$work/sniptide-install-reuse/.env"
echo 'Install script: refused to reuse a database volume it has no password for.'

# 3. The Coolify template, using the image under test and the variables Coolify generates.
# Coolify creates the named volumes itself, so the template doesn't declare them; plain compose needs them.
sed "s|ghcr.io/dino-kupinic/sniptide:latest|$image|" deploy/coolify/sniptide.yaml >"$work/coolify.yaml"
printf '\nvolumes:\n  sniptide-postgres-data:\n' >>"$work/coolify.yaml"
export SERVICE_USER_POSTGRES=sniptide SERVICE_PASSWORD_POSTGRES=templatepassword123
export SERVICE_BASE64_64_SNIPTIDE="template-smoke-test-secret-at-least-32-characters"
export SERVICE_URL_SNIPTIDE=https://paste.example.com
docker compose -p sniptide-template-test -f "$work/coolify.yaml" up -d --wait --wait-timeout 180
docker compose -p sniptide-template-test -f "$work/coolify.yaml" exec -T sniptide node -e \
  "fetch('http://127.0.0.1:3000/sign-in').then(r => process.exit(r.status === 200 ? 0 : 1)).catch(() => process.exit(1))"
echo 'Coolify template: app and database came up healthy.'
