#!/usr/bin/env bash
# Back up Sniptide's database from the Compose `db` service into one compressed file.
#
#   bash scripts/backup.sh [DIRECTORY]
#
# Run it from the directory that holds docker-compose.yml (and .env). It writes
# DIRECTORY/sniptide-<UTC time>.dump (default ./backups) in pg_dump's custom format, checks that
# the file can be read back, and prints its path. The file holds everything Sniptide stores,
# password hashes and API token hashes included, so it is created readable by you alone: keep it
# somewhere private, off this server. Keep BETTER_AUTH_SECRET (and ENV_SECRETS_KEY, if you set it)
# with it: env groups can't be decrypted without the same key.
#
# BACKUP_KEEP_DAYS=14 also deletes sniptide-*.dump files in DIRECTORY older than that many days.
set -euo pipefail

directory="${1:-${BACKUP_DIR:-./backups}}"
keep_days="${BACKUP_KEEP_DAYS:-}"
compose=(docker compose)

if ! "${compose[@]}" ps --status running --services 2>/dev/null | grep -qx db; then
  echo "The db service isn't running. Run this next to docker-compose.yml, with the stack up." >&2
  exit 1
fi

umask 077
mkdir -p "$directory"
file="$directory/sniptide-$(date -u +%Y%m%dT%H%M%SZ).dump"
partial="$file.partial"
trap 'rm -f "$partial"' EXIT

# --no-owner and --no-privileges keep the file usable on any database role.
"${compose[@]}" exec -T db pg_dump -U sniptide -d sniptide \
  --format=custom --no-owner --no-privileges >"$partial"

# A dump that can't be listed can't be restored.
"${compose[@]}" exec -T db pg_restore --list <"$partial" >/dev/null
mv "$partial" "$file"
trap - EXIT

echo "Backed up to $file ($(du -h "$file" | cut -f1))"

if [ -n "$keep_days" ]; then
  find "$directory" -maxdepth 1 -name 'sniptide-*.dump' -mtime "+$keep_days" -print -delete |
    sed 's/^/Removed old backup /'
fi
