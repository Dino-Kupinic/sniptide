#!/bin/sh
set -eu
umask 077

mode=${1:-schedule}
case "$mode" in
  schedule | scheduled | pre-deploy) ;;
  *) echo 'Usage: backup.sh [schedule|scheduled|pre-deploy]' >&2; exit 2 ;;
esac

: "${BACKUP_BUCKET:?Set the Cloudflare R2 bucket name}"
: "${BACKUP_AGE_RECIPIENT:?Set the public age recipient}"
: "${BACKUP_R2_ACCESS_KEY_ID:?Set the R2 access key ID}"
: "${BACKUP_R2_SECRET_ACCESS_KEY:?Set the R2 secret access key}"
case "$BACKUP_BUCKET" in
  *[!a-zA-Z0-9-]*) echo 'Set BACKUP_BUCKET to a bucket name without a prefix.' >&2; exit 2 ;;
esac
case "${BACKUP_R2_ENDPOINT:-}" in
  https://?*) ;;
  *) echo 'Set BACKUP_R2_ENDPOINT to the HTTPS S3 endpoint.' >&2; exit 2 ;;
esac
if [ "$mode" != pre-deploy ]; then
  case "${BACKUP_HEARTBEAT_URL:-}" in
    https://?*) ;;
    *) echo 'Set BACKUP_HEARTBEAT_URL to the HTTPS ping URL.' >&2; exit 2 ;;
  esac
fi

if [ "$mode" = schedule ]; then
  while true; do
    /bin/sh "$0" scheduled || echo 'Scheduled backup failed. Retrying in 15 minutes.' >&2
    sleep 900
  done
fi

ping() {
  response=$(curl --fail --silent --max-time 15 --retry 2 --retry-max-time 45 \
    --output /dev/null --write-out '%{http_code}' "${BACKUP_HEARTBEAT_URL%/}$1") || return 1
  case "$response" in 2??) return 0 ;; *) return 1 ;; esac
}

directory=${BACKUP_DIRECTORY:-/backups}
mkdir -p "$directory"
exec 9>"$directory/.offsite-lock"
# One backup can publish state and prune files at a time, even across sidecar restarts.
if ! flock -w 60 9; then
  echo 'Another backup holds the lock. Try again in a minute.' >&2
  exit 1
fi

clock=$(date -u '+%Y%m%dT%H%M%SZ %G-W%V')
stamp=${clock% *}
week=${clock#* }
day=${stamp%T*}
month=${day%??}
if [ "$mode" = scheduled ] && [ "$(cat "$directory/.last-success" 2>/dev/null || true)" = "$day" ]; then
  exit 0
fi

pending=
cleanup() {
  status=$?
  if [ -n "$pending" ]; then rm -rf "$pending"; fi
  if [ "$status" -ne 0 ] && [ "$mode" = scheduled ]; then
    ping /fail || echo 'Could not report the backup failure to the heartbeat monitor.' >&2
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

find "$directory" -maxdepth 1 -type d -name '.pending.*' -exec rm -rf {} +
find "$directory" -maxdepth 1 -type f -name 'sniptide-*.dump' -mtime +2 -delete
pending=$(mktemp -d "$directory/.pending.XXXXXXXX")
snapshot="$stamp.${pending##*.}"
if [ "$mode" = scheduled ]; then
  name=$day
else
  name=$snapshot
fi
dump="$directory/sniptide-$name.dump"
encrypted="$pending/dump.age"

export PGCONNECT_TIMEOUT=${PGCONNECT_TIMEOUT:-10}
pg_dump --format=custom --no-owner --no-privileges --lock-wait-timeout=10s > "$pending/dump"
pg_restore --list "$pending/dump" >/dev/null
mv "$pending/dump" "$dump"
age -r "$BACKUP_AGE_RECIPIENT" -o "$encrypted" "$dump"

export RCLONE_CONFIG_OFFSITE_TYPE=s3 RCLONE_CONFIG_OFFSITE_PROVIDER=Cloudflare
export RCLONE_CONFIG_OFFSITE_ENDPOINT="$BACKUP_R2_ENDPOINT" RCLONE_CONFIG_OFFSITE_REGION=auto
export RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID="$BACKUP_R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY="$BACKUP_R2_SECRET_ACCESS_KEY"

upload() {
  # A retry after an interrupted upload needs a fresh key because bucket locks forbid overwrites.
  object="$1/$snapshot.dump.age"
  if ! rclone copyto "$encrypted" "offsite:$BACKUP_BUCKET/$object" \
      --config /dev/null --no-check-dest --s3-no-check-bucket \
      --contimeout 15s --timeout 2m --retries 2; then
    echo "Upload failed for $object." >&2
    return 1
  fi
  echo "Uploaded $object"
}

remember() {
  printf '%s\n' "$2" > "$pending/state"
  mv "$pending/state" "$directory/$1"
}

upload_slot() {
  marker=".uploaded-$1"
  if [ "$(cat "$directory/$marker" 2>/dev/null || true)" != "$2" ]; then
    upload "$1"
    remember "$marker" "$2"
  fi
}

if [ "$mode" = pre-deploy ]; then
  upload pre-deploy
else
  upload_slot daily "$day"
  upload_slot weekly "$week"
  upload_slot monthly "$month"
  if ! ping ''; then
    echo 'Backup uploaded, but the heartbeat ping failed.' >&2
    exit 1
  fi
  remember .last-success "$day"
fi
