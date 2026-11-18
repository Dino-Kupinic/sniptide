#!/usr/bin/env bash
set -euo pipefail

script="$(cd "$(dirname "$0")/.." && pwd)/deploy/coolify/backup.sh"
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT
mkdir "$test_dir/bin" "$test_dir/backups"

export PATH="$test_dir/bin:$PATH"
export BACKUP_DIRECTORY="$test_dir/backups"
export BACKUP_BUCKET=sniptide-private
export BACKUP_AGE_RECIPIENT=age1test
export BACKUP_HEARTBEAT_URL=https://hc-ping.example/check
export BACKUP_B2_ENDPOINT=https://s3.example
export BACKUP_B2_REGION=us-west-004
export BACKUP_B2_KEY_ID=test-id BACKUP_B2_APP_KEY=test-key
export CALLS="$test_dir/calls"
export CLOCK='20261130T040000Z 2026-W49'

cat >"$test_dir/bin/stub" <<'EOF'
#!/bin/sh
set -eu
tool=${0##*/}
case "$tool" in
  date) printf '%s\n' "$CLOCK" ;;
  flock) ;; # macOS has no flock. The sidecar installs it from Alpine.
  pg_dump) printf 'raw database dump\n' ;;
  pg_restore) test "${FAIL_AT:-}" != validate && test -s "$2" ;;
  age)
    test "${FAIL_AT:-}" != encrypt
    printf 'encrypted\n' > "$4"
    ;;
  rclone)
    test "$1" = copyto && test "$(cat "$2")" = encrypted
    printf 'upload %s\n' "$3" >> "$CALLS"
    case "$3" in *"/${FAIL_AT:-none}/"*) exit 1 ;; esac
    ;;
  curl)
    for url; do :; done
    printf 'ping %s\n' "$url" >> "$CALLS"
    case "$url" in
      */fail) echo 200 ;;
      *) echo "${HEARTBEAT_STATUS:-200}" ;;
    esac
    ;;
esac
EOF
chmod +x "$test_dir/bin/stub"
for tool in date flock pg_dump pg_restore age rclone curl; do
  ln -s stub "$test_dir/bin/$tool"
done

run() { sh "$script" "$@"; }
assert_calls() { diff -u - "$CALLS"; }

touch -t 202001010000 "$BACKUP_DIRECTORY/sniptide-obsolete.dump"
run scheduled
assert_calls <<'EOF'
upload offsite:sniptide-private/daily/20261130.dump.age
upload offsite:sniptide-private/weekly/2026-W49.dump.age
upload offsite:sniptide-private/monthly/202611.dump.age
ping https://hc-ping.example/check
EOF
test ! -e "$BACKUP_DIRECTORY/sniptide-obsolete.dump"
test "$(cat "$BACKUP_DIRECTORY"/sniptide-*.dump)" = 'raw database dump'

: > "$CALLS"
run scheduled
test ! -s "$CALLS"

export CLOCK='20261201T041000Z 2026-W49'
if FAIL_AT=monthly run scheduled; then exit 1; fi
assert_calls <<'EOF'
upload offsite:sniptide-private/daily/20261201.dump.age
upload offsite:sniptide-private/monthly/202612.dump.age
ping https://hc-ping.example/check/fail
EOF

: > "$CALLS"
run scheduled
assert_calls <<'EOF'
upload offsite:sniptide-private/monthly/202612.dump.age
ping https://hc-ping.example/check
EOF

export CLOCK='20261202T040000Z 2026-W49'
for stage in validate encrypt; do
  : > "$CALLS"
  if FAIL_AT="$stage" run scheduled; then exit 1; fi
  assert_calls <<'EOF'
ping https://hc-ping.example/check/fail
EOF
done

: > "$CALLS"
run pre-deploy
test "$(wc -l < "$CALLS" | tr -d ' ')" = 1
grep -Eq '^upload offsite:sniptide-private/pre-deploy/20261202T040000Z\.[A-Za-z0-9]+\.dump\.age$' "$CALLS"
test -z "$(find "$BACKUP_DIRECTORY" -name '.pending.*')"

: > "$CALLS"
if HEARTBEAT_STATUS=302 run scheduled; then exit 1; fi
assert_calls <<'EOF'
upload offsite:sniptide-private/daily/20261202.dump.age
ping https://hc-ping.example/check
ping https://hc-ping.example/check/fail
EOF

: > "$CALLS"
run scheduled
assert_calls <<'EOF'
ping https://hc-ping.example/check
EOF

echo 'Coolify backup checks passed.'
