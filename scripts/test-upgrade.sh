#!/usr/bin/env bash
# Prove the upgrade and backup path end to end with real containers:
#
#   bash scripts/test-upgrade.sh PREVIOUS_IMAGE NEW_IMAGE
#
# 1. Start Sniptide on PREVIOUS_IMAGE (a published release) and seed it through the app itself:
#    an account, two pastes, an edit and an encrypted env group.
# 2. scripts/backup.sh takes a backup.
# 3. Upgrade the same stack to NEW_IMAGE: the data must be unchanged and the new image must have
#    migrated the database.
# 4. Restore the (older) backup into the running stack with scripts/restore.sh: data written after
#    the backup is gone, the backed-up data is back.
# 5. Restore the same backup into a brand-new stack with an empty database: everything is there,
#    including the env group, and the account can sign in.
# 6. Start that stack with a different BETTER_AUTH_SECRET: the env group can no longer be read,
#    which is why the secret has to be kept with backups.
#
# Set EXPECT_MIGRATION_LOG=1 to also require the startup migration log line (builds from this
# commit on write it; older releases don't).
set -euo pipefail
previous="${1:?Usage: bash scripts/test-upgrade.sh PREVIOUS_IMAGE NEW_IMAGE}"
new="${2:?Usage: bash scripts/test-upgrade.sh PREVIOUS_IMAGE NEW_IMAGE}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d)"
cd "$root"

export BETTER_AUTH_SECRET="upgrade-test-secret-at-least-32-characters-long"
# Not the defaults, so a developer's own stack can keep running.
export SNIPTIDE_PORT=3988 POSTGRES_PORT=55988
export COMPOSE_PROJECT_NAME=sniptide-upgrade-test-a
email="upgrade-test@example.com"
password="upgrade-test-password-12345"
token="snpt_upgradetest$(openssl rand -hex 16)"

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    for project in sniptide-upgrade-test-a sniptide-upgrade-test-b; do
      COMPOSE_PROJECT_NAME=$project docker compose logs --tail 80 2>&1 || true
    done
  fi
  for project in sniptide-upgrade-test-a sniptide-upgrade-test-b; do
    COMPOSE_PROJECT_NAME=$project docker compose down -v >/dev/null 2>&1 || true
  done
  rm -rf "$work"
  exit "$status"
}
trap cleanup EXIT

up() { SNIPTIDE_IMAGE="$1" docker compose up -d --no-build --wait --wait-timeout 240; }

sql() {
  docker compose exec -T db psql -U sniptide -d sniptide -v ON_ERROR_STOP=1 -At -c "$1"
}

# What must survive: accounts, pastes and their files, and the token's hash.
fingerprint() {
  sql "select md5(coalesce(string_agg(t, '|' order by t), '')) from (
         select 'u:' || id || email as t from \"user\"
         union all select 'p:' || slug || title || visibility from paste
         union all select 'f:' || p.slug || f.name || md5(f.content)
                   from paste_file f join paste p on p.id = f.paste_id
         union all select 'k:' || hash from api_token
       ) x"
}

# Runs the check script inside the app container, which has node and reaches the app on 3000.
client() {
  docker compose exec -T -e MODE="$1" -e TOKEN="$token" -e EMAIL="$email" -e PASSWORD="$password" \
    -e SLUGS="${2:-}" app node --input-type=module <"$work/client.mjs"
}

cat >"$work/client.mjs" <<'JS'
import assert from 'node:assert/strict'

const origin = 'http://localhost:3000'
const { MODE, TOKEN, EMAIL, PASSWORD } = process.env
const slugs = process.env.SLUGS ? JSON.parse(process.env.SLUGS) : {}

async function api(method, path, body) {
  const response = await fetch(`${origin}/api/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  return { status: response.status, data }
}

async function auth(path, body) {
  const response = await fetch(`${origin}/api/auth/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify(body),
  })
  return { status: response.status, data: await response.json() }
}

const files = [
  { name: 'probe.ts', content: 'export const probe = "survives upgrades"\n' },
  { name: 'notes.txt', content: 'a second file\nwith two lines\n' },
]

if (MODE === 'signup') {
  const { status, data } = await auth('sign-up/email', {
    name: 'Upgrade test', username: 'upgrade-test', email: EMAIL, password: PASSWORD,
  })
  assert.equal(status, 200, JSON.stringify(data))
}

if (MODE === 'seed') {
  const first = await api('POST', '/pastes', {
    title: 'Upgrade probe', description: 'must survive', visibility: 'unlisted', tags: ['upgrade'], files,
  })
  assert.equal(first.status, 201, JSON.stringify(first.data))
  const slug = first.data.paste.slug
  const edit = await api('PUT', `/pastes/${slug}`, { title: 'Upgrade probe (edited)', files })
  assert.equal(edit.status, 200, JSON.stringify(edit.data))
  const second = await api('POST', '/pastes', {
    title: 'Private probe', visibility: 'private', files: [{ name: 'p.txt', content: 'private\n' }],
  })
  assert.equal(second.status, 201, JSON.stringify(second.data))
  const env = await api('PUT', '/env/upgrade-test', { variables: [{ name: 'PROBE', value: 'env-survives' }] })
  assert.equal(env.status, 200, JSON.stringify(env.data))
  console.log(JSON.stringify({ first: slug, second: second.data.paste.slug }))
}

if (MODE === 'extra') {
  const extra = await api('POST', '/pastes', {
    title: 'Written after the backup', visibility: 'unlisted', files: [{ name: 'x.txt', content: 'x\n' }],
  })
  assert.equal(extra.status, 201, JSON.stringify(extra.data))
  console.log(extra.data.paste.slug)
}

if (MODE === 'gone') {
  assert.equal((await api('GET', `/pastes/${slugs.extra}`)).status, 404, 'a paste written after the backup should be gone')
}

if (MODE === 'env-unreadable') {
  const env = await api('GET', '/env/upgrade-test')
  assert.notEqual(env.status, 200, 'env values should not decrypt with a different secret')
  console.log(`env group answered ${env.status} with a different secret`)
}

if (MODE === 'verify') {
  const me = await api('GET', '/me')
  assert.equal(me.status, 200, JSON.stringify(me.data))
  assert.deepEqual(me.data.scopes, ['read', 'write'])
  const first = await api('GET', `/pastes/${slugs.first}`)
  assert.equal(first.status, 200, JSON.stringify(first.data))
  assert.equal(first.data.paste.title, 'Upgrade probe (edited)')
  assert.deepEqual(first.data.paste.files.map(({ name, content }) => ({ name, content })), files)
  assert.equal((await api('GET', `/pastes/${slugs.second}`)).data.paste.visibility, 'private')
  const env = await api('GET', '/env/upgrade-test')
  assert.equal(env.status, 200, JSON.stringify(env.data))
  assert.deepEqual(env.data.group.variables, [{ name: 'PROBE', value: 'env-survives' }])
  const signIn = await auth('sign-in/email', { email: EMAIL, password: PASSWORD })
  assert.equal(signIn.status, 200, JSON.stringify(signIn.data))
}
JS

echo "== 1. Seed a stack running $previous"
up "$previous"
client signup
sql "insert into api_token (owner_id, name, prefix, hash, scopes)
     select id, 'upgrade test', 'snpt_upgrade', encode(sha256(convert_to('$token', 'UTF8')), 'hex'),
            array['read', 'write'] from \"user\" where email = '$email'" >/dev/null
slugs="$(client seed | tail -1)"
client verify "$slugs"
before="$(fingerprint)"
echo "Seeded: $slugs"

echo "== 2. Back up"
bash scripts/backup.sh "$work/backups"
backups=("$work"/backups/sniptide-*.dump)
test "${#backups[@]}" = 1
backup="${backups[0]}"

echo "== 3. Upgrade to $new"
export SNIPTIDE_IMAGE="$new"
up "$new"
client verify "$slugs"
test "$(fingerprint)" = "$before"
if [ "${EXPECT_MIGRATION_LOG:-}" = 1 ]; then
  docker compose logs app | grep -q '"event":"migrations"'
fi
echo "The upgrade kept every paste, file, account and token."

echo "== 4. Restore the backup into the running stack"
extra="$(client extra | tail -1)"
bash scripts/restore.sh "$backup" --yes
client verify "$slugs"
client gone "{\"extra\":\"$extra\"}"
test "$(fingerprint)" = "$before"
docker compose down -v >/dev/null

echo "== 5. Restore the backup into a brand-new stack"
export COMPOSE_PROJECT_NAME=sniptide-upgrade-test-b SNIPTIDE_PORT=3989 POSTGRES_PORT=55989
bash scripts/restore.sh "$backup" --yes
client verify "$slugs"
test "$(fingerprint)" = "$before"

echo "== 6. The same backup with a different auth secret"
export BETTER_AUTH_SECRET="a-different-secret-at-least-32-characters-long"
docker compose up -d --no-build --wait --wait-timeout 240
client env-unreadable

echo "Upgrade, backup and restore passed: $previous -> $new."
