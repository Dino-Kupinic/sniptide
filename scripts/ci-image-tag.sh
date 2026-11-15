#!/usr/bin/env bash
# Emit the image tag only for trusted CI events. Arguments come from GitHub context, not PR code.
set -euo pipefail
repository="${1:?repository required}"
event="${2:?event required}"
ref="${3:?ref required}"
head_repository="${4-}"
sha="${5:?commit SHA required}"
run_id="${6:?run ID required}"
attempt="${7:?run attempt required}"
actor="${8:?actor required}"
author="${9-}"

if [[ ! "$repository" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || \
   [[ ! "$sha" =~ ^[a-f0-9]{40}$ ]] || [[ ! "$run_id" =~ ^[0-9]+$ ]] || \
   [[ ! "$attempt" =~ ^[0-9]+$ ]]; then
  echo 'Invalid image tag inputs' >&2
  exit 1
fi

if [[ "$event" == push && "$ref" == refs/heads/main ]] || \
   [[ "$event" == pull_request && "$head_repository" == "$repository" && \
      "$actor" != "dependabot[bot]" && "$author" != "dependabot[bot]" ]]; then
  repository="$(printf %s "$repository" | tr '[:upper:]' '[:lower:]')"
  printf 'ghcr.io/%s:sha-%s-%s-%s\n' "$repository" "$sha" "$run_id" "$attempt"
fi
