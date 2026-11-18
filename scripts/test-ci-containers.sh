#!/usr/bin/env bash
# Each test owns its Compose project, ports, or private Docker network.
set -euo pipefail
image=${1:?Usage: test-ci-containers.sh IMAGE [PREVIOUS_IMAGE]}
previous=${2:-}

if [[ "${FULL_CONTAINER_CHECKS:-true}" != true ]]; then
  exec bash scripts/test-docker.sh "$image"
fi

logs=$(mktemp -d)
trap 'rm -rf "$logs"' EXIT
names=()
pids=()

start() {
  local name=$1
  shift
  names+=("$name")
  "$@" > "$logs/$name" 2>&1 &
  pids+=("$!")
}

start smoke bash scripts/test-docker.sh "$image"
start compose bash scripts/test-compose.sh "$image"
start postgres-upgrade bash scripts/test-postgres-upgrade.sh
if [[ -n "$previous" ]]; then
  start upgrade-restore env EXPECT_MIGRATION_LOG=1 bash scripts/test-upgrade.sh "$previous" "$image"
fi

status=0
for index in "${!names[@]}"; do
  name=${names[$index]}
  if ! wait "${pids[$index]}"; then
    echo "::error::Container check failed: $name"
    status=1
  fi
  echo "::group::$name"
  cat "$logs/$name"
  echo "::endgroup::"
done
exit "$status"
