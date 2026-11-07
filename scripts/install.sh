#!/bin/sh
# Install or upgrade a self-hosted Sniptide with Docker Compose.
#
#   curl -fsSL https://sniptide.com/install.sh | sh
#   curl -fsSL https://sniptide.com/install.sh | sh -s -- --domain paste.example.com
#
# It downloads docker-compose.yml and .env.example into a folder (./sniptide by default), writes
# .env with a generated auth secret and database password, and starts the stack. With a domain,
# the bundled Caddy proxy serves it over HTTPS. Run it again in the same folder to upgrade: it
# keeps .env and pulls the newer image.
#
# Options, also read from the environment:
#   --domain NAME   SNIPTIDE_DOMAIN   Public domain for HTTPS. Its DNS must point at this server.
#   --dir PATH      SNIPTIDE_DIR      Folder for the files and .env. Default: ./sniptide
#   --ref REF       SNIPTIDE_REF      Git tag or branch to download the files from. Default: the
#                                     latest release.
#   --yes           SNIPTIDE_YES=1    Don't ask anything; use the options above as given.
# SNIPTIDE_SOURCE_URL replaces the download location of the two files, for testing a checkout
# (file:///path/to/sniptide).
set -eu

REPO="Dino-Kupinic/sniptide"
domain="${SNIPTIDE_DOMAIN:-}"
dir="${SNIPTIDE_DIR:-./sniptide}"
ref="${SNIPTIDE_REF:-}"
yes="${SNIPTIDE_YES:-}"

say() { printf '%s\n' "$*"; }
fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
  --domain) domain="${2:?--domain needs a value}"; shift 2 ;;
  --domain=*) domain="${1#*=}"; shift ;;
  --dir) dir="${2:?--dir needs a value}"; shift 2 ;;
  --dir=*) dir="${1#*=}"; shift ;;
  --ref) ref="${2:?--ref needs a value}"; shift 2 ;;
  --ref=*) ref="${1#*=}"; shift ;;
  --yes | -y) yes=1; shift ;;
  -h | --help)
    say "Usage: install.sh [--domain NAME] [--dir PATH] [--ref REF] [--yes]"
    say "Installs or upgrades Sniptide with Docker Compose. See https://docs.sniptide.com/self-hosting/install-script"
    exit 0
    ;;
  *) fail "unknown option $1. Run with --help to see the options." ;;
  esac
done

# Questions read from the terminal, since stdin is the script itself under `curl | sh`.
can_ask() { [ -z "$yes" ] && [ -r /dev/tty ] && (: </dev/tty) 2>/dev/null; }
ask() {
  printf '%s' "$1" >/dev/tty
  read -r answer </dev/tty || answer=""
  printf '%s' "$answer"
}

download() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$2" "$1"
  else
    fail "curl or wget is needed to download the files."
  fi
}

random_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$1"
  else
    od -An -N"$1" -tx1 /dev/urandom | tr -d ' \n'
  fi
}

# 1. Docker and the Compose plugin.
if ! command -v docker >/dev/null 2>&1; then
  say "Docker isn't installed. Install it with Docker's script, then run this installer again:"
  say "  curl -fsSL https://get.docker.com | sh"
  exit 1
fi
docker compose version >/dev/null 2>&1 ||
  fail "the Docker Compose plugin is missing. See https://docs.docker.com/compose/install/linux/"
if ! docker info >/dev/null 2>&1; then
  fail "can't reach the Docker daemon. Start Docker, or run this installer with sudo."
fi

# 2. The files, from the latest release unless a ref is given.
if [ -z "$ref" ]; then
  if command -v curl >/dev/null 2>&1; then
    ref="$(curl -fsSI "https://github.com/$REPO/releases/latest" 2>/dev/null |
      sed -n 's|^[Ll]ocation: .*/releases/tag/\([^[:space:]]*\).*|\1|p' | tr -d '\r')"
  fi
  [ -n "$ref" ] || ref="main"
fi
source="${SNIPTIDE_SOURCE_URL:-https://raw.githubusercontent.com/$REPO/$ref}"
mkdir -p "$dir"
cd "$dir"
say "Downloading Sniptide's Compose files ($ref) into $(pwd)"
download "$source/docker-compose.yml" docker-compose.yml
download "$source/.env.example" .env.example

# Compose names the stack after the folder, so its database volume is <project>_postgres.
project="$(BETTER_AUTH_SECRET=unused docker compose config --format json 2>/dev/null |
  sed -n 's/^ *"name": *"\([^"]*\)".*/\1/p' | head -n 1)"

# 3. Settings. An existing .env is kept, so running the installer again upgrades.
if [ -f .env ]; then
  say "Keeping the existing .env. To start over, run 'docker compose down -v' here, which deletes"
  say "every account and paste, then delete .env and run the installer again."
else
  # Postgres sets its password only when the volume is first created. A volume left by an earlier
  # install, or by a development checkout in another folder with the same name, keeps the old
  # password, and the app could never sign in with the new one.
  if [ -n "$project" ] && docker volume inspect "${project}_postgres" >/dev/null 2>&1; then
    fail "Docker already has a database volume named ${project}_postgres, from an earlier install or \
another Compose project named \"$project\", such as a development checkout. Its password won't match \
a new .env. Install into a folder with another name, for example --dir ~/sniptide-server, or delete \
that data with 'docker volume rm ${project}_postgres' if you no longer need it."
  fi

  if [ -z "$domain" ] && can_ask; then
    say ""
    say "Sniptide needs HTTPS for copy buttons, password unlocks and the CLI."
    say "With a domain whose DNS points at this server (ports 80 and 443 open), it gets a"
    say "certificate on its own. Leave it empty to try it on plain HTTP first."
    domain="$(ask 'Domain (for example paste.example.com): ')"
  fi
  domain="$(printf '%s' "$domain" | sed -e 's|^[a-zA-Z]*://||' -e 's|/.*$||' | tr 'A-Z' 'a-z')"

  if [ -n "$domain" ] && command -v getent >/dev/null 2>&1 && ! getent hosts "$domain" >/dev/null; then
    say "Warning: $domain doesn't resolve yet. Caddy retries the certificate once its DNS points here."
  fi

  umask 077
  {
    say "# Written by the Sniptide installer. Every option is in .env.example."
    say "# Keep BETTER_AUTH_SECRET and back it up: changing it signs everyone out and makes stored"
    say "# env values unreadable."
    say "BETTER_AUTH_SECRET=$(random_hex 32)"
    say "POSTGRES_PASSWORD=$(random_hex 16)"
    say "# Sign-up closes once the first account (yours) exists. Set true to let anyone sign up."
    say "ALLOW_SIGN_UP=first"
    if [ -n "$domain" ]; then
      say "# HTTPS through the bundled Caddy proxy, which is the only way in."
      say "SNIPTIDE_DOMAIN=$domain"
      say "COMPOSE_PROFILES=proxy"
      say "SNIPTIDE_BIND=127.0.0.1"
      say "BETTER_AUTH_URL=https://$domain"
      say "CLIENT_IP_SOURCE=x-forwarded-for"
      say "TRUSTED_PROXIES=private"
    else
      address="$(hostname -I 2>/dev/null | awk '{print $1}')"
      say "BETTER_AUTH_URL=http://${address:-localhost}:3000"
    fi
  } >.env
  say "Wrote .env with a new auth secret and database password."
fi

# 4. Start, or upgrade, the stack.
say "Starting Sniptide. The first start downloads the images and can take a minute."
# A failed pull falls back to an image already on this server. The install folder has no source
# code, so Compose must never try to build the app image itself.
docker compose pull --quiet --ignore-pull-failures
if ! docker compose up -d --no-build --wait --wait-timeout 300; then
  say "" >&2
  say "The last lines of the app's log:" >&2
  docker compose logs --no-log-prefix --tail 30 app >&2 || true
  fail "Sniptide didn't start. The log above usually names the cause, and \
https://docs.sniptide.com/self-hosting/install-script#if-something-fails lists the common ones."
fi

url="$(docker compose exec -T app printenv BETTER_AUTH_URL 2>/dev/null | tr -d '\r')"
say ""
say "Sniptide is running at ${url:-http://localhost:3000}"
say "Open it and create your account. Sign-up closes after the first account by default."
say "Your settings are in $(pwd)/.env. Back it up with your database."
