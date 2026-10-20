#!/usr/bin/env bash
# Run the docs image and check it serves a page, the search index and the app links. No host ports
# or volumes are used.
set -euo pipefail
image="${1:?Usage: bash scripts/test-docs-image.sh IMAGE}"
name="sniptide-docs-test-$(date +%s)-$$"

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    docker logs "$name" || true
  fi
  docker rm -fv "$name" >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

docker run -d --name "$name" "$image" >/dev/null

# Requests run inside the container: it ships node, not curl.
fetch() {
  docker exec "$name" node -e "
    fetch('http://127.0.0.1:3000$1')
      .then(async (r) => { if (!r.ok) process.exit(1); process.stdout.write(await r.text()) })
      .catch(() => process.exit(1))"
}

ready=false
for ((attempt = 0; attempt < 60; attempt++)); do
  if fetch / >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [ "$ready" != true ]; then
  echo "docs image never answered on port 3000" >&2
  exit 1
fi

fetch /getting-started | grep -q "Getting started"
fetch "/api/search?query=sniptide" | grep -q '"url"'
# The nav links to the app's API reference.
fetch / | grep -q "/docs/api"
echo "docs image OK"
