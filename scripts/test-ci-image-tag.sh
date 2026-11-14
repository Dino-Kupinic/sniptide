#!/usr/bin/env bash
set -euo pipefail
script="$(dirname "$0")/ci-image-tag.sh"
sha=0123456789abcdef0123456789abcdef01234567
expected="ghcr.io/example/sniptide:sha-$sha-123-1"
actual="$(bash "$script" Example/Sniptide push refs/heads/main '' "$sha" 123 1 user user)"
[[ "$actual" == "$expected" ]]
actual="$(bash "$script" Example/Sniptide pull_request refs/pull/7/merge Example/Sniptide "$sha" 123 1 user user)"
[[ "$actual" == "$expected" ]]
actual="$(bash "$script" Example/Sniptide pull_request refs/pull/7/merge stranger/Sniptide "$sha" 123 1 user user)"
[[ -z "$actual" ]]
actual="$(bash "$script" Example/Sniptide pull_request refs/pull/7/merge Example/Sniptide "$sha" 123 1 'dependabot[bot]' 'dependabot[bot]')"
[[ -z "$actual" ]]
actual="$(bash "$script" Example/Sniptide pull_request refs/pull/7/merge Example/Sniptide "$sha" 123 1 user 'dependabot[bot]')"
[[ -z "$actual" ]]
actual="$(bash "$script" Example/Sniptide push refs/heads/feature '' "$sha" 123 1 user user)"
[[ -z "$actual" ]]
actual="$(bash "$script" Example/Sniptide push refs/heads/main '' "$sha" 123 2 user user)"
[[ "$actual" != "$expected" ]]
if bash "$script" Example/Sniptide push refs/heads/main '' invalid 123 1 user user >/dev/null 2>&1; then
  echo 'Invalid SHA was accepted' >&2
  exit 1
fi
echo 'CI image tag policy passed.'
