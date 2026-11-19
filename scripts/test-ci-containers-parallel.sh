#!/usr/bin/env bash
set -euo pipefail
runner="$(cd "$(dirname "$0")" && pwd)/test-ci-containers.sh"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cd "$work"
mkdir scripts

# Block each check until all four have started, then let compose report a failure.
for name in docker compose postgres-upgrade upgrade; do
  cat > "scripts/test-$name.sh" <<'SH'
set -eu
name=$(basename "$0" .sh)
touch "$name.started"
if [[ "${FULL_CONTAINER_CHECKS:-true}" != true ]]; then
  exit 0
fi
for attempt in {1..100}; do
  if [[ $(find . -name '*.started' | wc -l) -eq 4 ]]; then
    touch "$name.finished"
    [[ "$name" != test-compose ]]
    exit
  fi
  sleep 0.05
done
exit 1
SH
done

if bash "$runner" new-image old-image > full.log 2>&1; then
  echo "Expected compose failure to propagate" >&2
  exit 1
fi
test "$(find . -name '*.finished' | wc -l)" -eq 4
test "$(grep -c '^::error::Container check failed: compose$' full.log)" -eq 1
test "$(grep -c '^::error::' full.log)" -eq 1

rm ./*.started ./*.finished
FULL_CONTAINER_CHECKS=false bash "$runner" new-image
test -f test-docker.started
test "$(find . -name '*.started' | wc -l)" -eq 1
