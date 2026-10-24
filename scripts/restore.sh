#!/usr/bin/env bash
# Restore a Sniptide backup into the Compose stack in the current directory. Works on a running
# instance and on a brand-new one.
#
#   bash scripts/restore.sh BACKUP_FILE [--yes]
#
# This REPLACES the whole database with the backup: whatever is in it now is dropped. It stops the
# app, recreates the database, loads the file and starts the app again, which then applies any
# migrations the backup is missing (a backup from an older version restores into a newer one).
#
# On a new server: copy docker-compose.yml and .env (with the SAME BETTER_AUTH_SECRET and, if you
# set it, ENV_SECRETS_KEY as the old instance) and run this. No other step is needed.
set -euo pipefail

file="${1:-}"
confirm="${2:-}"
if [ -z "$file" ] || [ "${file#-}" != "$file" ]; then
  echo "Usage: bash scripts/restore.sh BACKUP_FILE [--yes]" >&2
  exit 2
fi
if [ ! -f "$file" ]; then
  echo "No such file: $file" >&2
  exit 2
fi
compose=(docker compose)

if [ "$confirm" != "--yes" ]; then
  if [ ! -t 0 ]; then
    echo "This replaces the database. Pass --yes to run it without a prompt." >&2
    exit 2
  fi
  read -r -p "Replace the current Sniptide database with $file? [y/N] " answer
  case "$answer" in y | Y | yes) ;; *) echo "Cancelled." >&2; exit 1 ;; esac
fi

"${compose[@]}" up -d --wait db

# Refuse a file that isn't a readable dump before anything is dropped.
if ! "${compose[@]}" exec -T db pg_restore --list <"$file" >/dev/null; then
  echo "$file isn't a readable Sniptide backup. The database was not changed." >&2
  exit 1
fi

# Nothing may be writing while the database is replaced.
"${compose[@]}" stop app >/dev/null 2>&1 || true

"${compose[@]}" exec -T db psql -U sniptide -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS sniptide WITH (FORCE)" \
  -c "CREATE DATABASE sniptide"
"${compose[@]}" exec -T db pg_restore -U sniptide -d sniptide \
  --no-owner --no-privileges --exit-on-error <"$file"

# Starts the app (creating it on a new server). It migrates the restored database on startup.
"${compose[@]}" up -d --wait
echo "Restored $file. Sign in to check your pastes."
