# Sniptide

Code snippet sharing at sniptide.com. A Bun + Turborepo monorepo with one Next.js app, run as a
Docker container on Coolify with Cloudflare in front, backed by Postgres.

## Setup

```bash
bun install
cp apps/web/.env.example apps/web/.env.local   # then set BETTER_AUTH_SECRET
echo "BETTER_AUTH_SECRET=$(openssl rand -hex 32)" > .env   # compose insists on one, even for `db`
docker compose up -d db                        # local Postgres on localhost:5432
bun dev
```

The app applies database migrations itself when it starts (`apps/web/instrumentation.ts`), so the
local database is set up and kept current by `bun dev`.

GitHub and Google sign-in are optional: set `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` and
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` to turn them on. Until then their buttons render
disabled.

## Contributing

Commits and PR titles follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`,
`fix:`, `docs:`, …), enforced by a git hook and a CI check. See [CONTRIBUTING.md](CONTRIBUTING.md).

## API reference

The HTTP endpoints Sniptide serves (raw files, unlock, reveal, health, metrics, and the token API
under `/api/v1` that the CLI uses) are documented at
`/docs/api`, rendered by [Scalar](https://scalar.com) from the OpenAPI document at
`/api/openapi.json`. The document lives in `apps/web/lib/openapi.ts`. When you add a route
handler, document it there, or list it as internal if it only serves the web app; `bun test` fails
until you do.

## Link previews and channel sharing

Public pastes without password or one-time protection include Open Graph and X cards with the
title, language and the first ten lines of the first file. Private, unlisted and protected pastes
have no code image. Preview requests neither count views nor consume one-time pastes; images
are not cached by Sniptide. Messaging services may retain a preview they already fetched.

Set `SLACK_WEBHOOK_URL` and/or `DISCORD_WEBHOOK_URL` on the app server to enable **Share → Share
to Slack/Discord**. Create an incoming webhook in the destination channel, copy its URL into
the matching environment variable, and restart the app. Each provider has one destination for
the instance; the dialog tells owners that everyone in the channel receives the link. Only
owners can send live public or unlisted pastes without password or one-time protection, with
20 sends per hour per account across both providers. URLs remain server secrets. A failed or
timed-out send reports an error without automatically retrying; check the channel before retrying.

## CLI

The [Sniptide CLI](packages/cli/README.md) captures files, folders or globs as pastes and restores their
relative paths in another project, and syncs `.env` files with env groups (`sniptide env`). It
authenticates with a personal API token from Settings → API tokens and talks to the `/api/v1`
endpoints ([summary](packages/cli/API.md)). Env values are encrypted at rest with a key derived from
`ENV_SECRETS_KEY`, or from `BETTER_AUTH_SECRET` when that isn't set (`apps/web/.env.example`).

```sh
bun --filter @sniptide/cli build
node packages/cli/dist/sniptide.js --help
bun run test:cli
```

## MCP for coding agents

The [Sniptide MCP server](packages/mcp/README.md) exposes snippet search, reads, collection recipes,
creation and updates. Connect Claude Code or Cursor to `/api/mcp` with a personal API token, or
build `@sniptide/mcp` and run its local Node stdio executable. Both work with hosted and self-hosted
instances. See the guide for client configuration and tool semantics.

```sh
bun --filter @sniptide/mcp build
bun run test:mcp
```

## Database

The schema lives in `packages/db/src/schema`. After changing it:

```bash
bun --filter @workspace/db db:generate   # drizzle-kit writes packages/db/migrations/<timestamp>_<name>/
```

The next start of the app (locally or in production) applies the new migration.
`bun --filter @workspace/db db:migrate` applies them without starting the app. Both entry points acquire the same Postgres advisory
lock before reading migration state, so simultaneous app starts and manual migrations run in
sequence. A failure rolls back the migration transaction and releases the lock. Auth tables are
generated from better-auth's core schema (`packages/db/src/schema/auth.ts`); regenerate them when
adding better-auth plugins.

Keep migrations additive (new tables and columns) where possible: the old container keeps
serving until the new one is healthy, and it runs against the migrated database.

## Deploy

Coolify builds the `Dockerfile` from `main` and runs it. One-time setup of the Coolify app:

- **Source:** this repository, branch `main`, build pack **Dockerfile**, auto-deploy on push.
- **Port:** `3000`. **Health check:** `GET /api/health`.
- **Database:** a Postgres resource in the same Coolify project (Postgres 17); use its internal
  connection URL as `DATABASE_URL` and turn on its scheduled backups.
- **Environment variables:**
  - `DATABASE_URL`: `postgres://…` from the Postgres resource
  - `BETTER_AUTH_SECRET`: a long random string (`openssl rand -hex 32`)
  - `BETTER_AUTH_URL`: `https://app.sniptide.com`
  - `SHARE_URL`: `https://sniptide.com` (share links' domain, see below)
  - `COOKIE_DOMAIN`: `sniptide.com`, so the landing page can see the session and send signed-in
    visitors to the app. Leave unset on a single domain.
  - optional: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`,
    `GOOGLE_CLIENT_SECRET`
  - `CLIENT_IP_SOURCE`: `cloudflare`, so rate limits key on the `CF-Connecting-IP` Cloudflare
    sets (the default, `direct`, would see only the proxy's address)
  - `POSTHOG_KEY`: the PostHog project key. The website uses the same project; filter on the
    `surface` event property (`app` or `marketing`)
  - optional: `SHARE_PROXY_SECRET`, a random string shared with the website so it can pass the
    visitor's IP (`X-Sniptide-Client-IP`) on share pages it proxies, for the unlock rate limits
- **Domain:** `https://app.sniptide.com`.

**PR previews.** Coolify's preview deployments get their own URL, secret and database, so they must
not read production's session cookie. Better Auth names that cookie `better-auth.session_token`
everywhere, and with `COOKIE_DOMAIN=sniptide.com` the browser sends production's copy to every
preview, which can't verify it (and shadows the one the preview sets, so sign-in seems to do
nothing until cookies are cleared). In the Coolify app's **Preview** environment variables (a
separate list from production's, so production keeps the default name and stays signed in), set:

- `COOKIE_PREFIX`: `preview` (any name that isn't `better-auth`; letters, digits, `-` and `_`)
- `COOKIE_DOMAIN`: leave empty, so each preview's cookie stays on its own host

`CLIENT_IP_SOURCE=cloudflare` is only safe while the origin accepts traffic from Cloudflare alone;
otherwise anyone who reaches the server directly can send their own `CF-Connecting-IP`.

sniptide.com itself is the website (`Dino-Kupinic/sniptide-web`). It proxies share links
(`sniptide.com/<slug>`, `/<slug>/raw`) to this app and redirects app pages to app.sniptide.com, so
share links stay short while the app runs on its subdomain. Self-hosted instances skip all of this:
leave `SHARE_URL` unset and the app serves everything, share links included, on its own domain.

Cloudflare handles DNS and proxies the domain to the server (orange cloud), with SSL/TLS set to
**Full (strict)**.

To try the production image locally with its database:

```bash
BETTER_AUTH_SECRET=$(openssl rand -hex 32) docker compose up -d --build
```

## Self-hosting

The official image is `ghcr.io/dino-kupinic/sniptide`, with Linux AMD64 and ARM64 support.
It contains the standalone Next.js server, static assets and database migrations. Settings come
from environment variables at runtime; no database or auth credentials are needed to build it.

With an existing Postgres database, create a `sniptide.env` file (keep it out of source control):

```dotenv
DATABASE_URL=postgres://user:password@your-postgres-host:5432/sniptide
BETTER_AUTH_SECRET=replace-with-a-long-random-secret
BETTER_AUTH_URL=http://localhost:3000
```

Generate the secret with `openssl rand -hex 32` and keep it across restarts. Use the public HTTPS
URL for `BETTER_AUTH_URL` when serving through a reverse proxy. The database host must be reachable
from the container; `localhost` inside it refers to the container itself.

```bash
docker run -d --name sniptide --restart unless-stopped \
  -p 3000:3000 --env-file sniptide.env ghcr.io/dino-kupinic/sniptide:latest
```

On startup, Sniptide applies migrations before serving requests. `GET /api/health` checks the
server and database, and the image includes a Docker health check. Back up your database before
upgrading; see [the rollout guide](docs/scaling.md) for migration and rollback considerations.

### Docker Compose

For a new database, `docker-compose.yml` runs the published app image plus Postgres. On a fresh
server with Docker installed, from zero to a running instance:

```bash
git clone https://github.com/Dino-Kupinic/sniptide.git && cd sniptide   # or download docker-compose.yml and .env.example
printf 'BETTER_AUTH_SECRET=%s\nBETTER_AUTH_URL=http://<your-server-ip>:3000\n' "$(openssl rand -hex 32)" > .env
docker compose up -d
```

Keep the secret: sessions depend on it. `BETTER_AUTH_URL` must be the exact address you open in
the browser (a domain with `https://` once you add HTTPS below); sign-in is rejected from any other
origin. Open it and create your account; the first start applies the database migrations. `.env.example` lists every setting compose accepts (`BETTER_AUTH_URL`,
`POSTGRES_PASSWORD`, sign-up and OAuth options, …); the app's own reference is
`apps/web/.env.example`.

Compose uses `latest` by default. For repeatable deployments, set
`SNIPTIDE_IMAGE=ghcr.io/dino-kupinic/sniptide:1.2.3` (substitute an actual release), or pin an image
digest. To update, run `docker compose pull` then `docker compose up -d`. To build from source
instead, run `docker compose up -d --build`. Back up the `postgres` volume (for example with
`pg_dump`). Set `POSTGRES_PASSWORD` in `.env` before the first start; Postgres keeps the password
it was created with.

**HTTPS on your own domain.** The optional `proxy` profile adds [Caddy](https://caddyserver.com),
which gets and renews a Let's Encrypt certificate. Point the domain's DNS at the server, open ports
80 and 443, then add this to `.env` and start with the profile:

```dotenv
SNIPTIDE_DOMAIN=paste.example.com
BETTER_AUTH_URL=https://paste.example.com
CLIENT_IP_SOURCE=x-forwarded-for
TRUSTED_PROXIES=private
SNIPTIDE_BIND=127.0.0.1   # optional: close port 3000 to the outside
```

```bash
docker compose --profile proxy up -d
```

Already running nginx, Traefik or Coolify? Skip the profile and put your proxy in front of port
3000 (see the table below for `CLIENT_IP_SOURCE`).

### Coolify

`deploy/coolify/sniptide.yaml` is a [Coolify](https://coolify.io) service template with the app
and Postgres. Coolify generates the database credentials and the auth secret and assigns the
domain, so there is nothing to fill in before the first deploy. In a Coolify project choose
**Add Resource → Docker Compose Empty**, paste the file, set the domain for the `sniptide` service
(port 3000), and deploy. It follows Coolify's service template format, so it can also be
contributed to Coolify's one-click service list. The optional settings (sign-up, OAuth, webhooks,
`MAX_PASTE_SIZE`) show up as environment variables on the resource.

### Settings

Sniptide boots with just `DATABASE_URL` and `BETTER_AUTH_SECRET`; add `BETTER_AUTH_URL` so browsers
can sign in (compose and the Coolify template set all three). Everything else is optional and documented with its default in `apps/web/.env.example`;
a test fails when the app reads a variable that file doesn't list. The hosted-only extras are off
unless you turn them on:

| Feature | Default on a self-hosted instance | Setting |
| --- | --- | --- |
| Email and password sign-in | On, always | n/a |
| GitHub and Google sign-in | Off; buttons render disabled | `GITHUB_CLIENT_ID`/`_SECRET`, `GOOGLE_CLIENT_ID`/`_SECRET` |
| Open sign-up | On: anyone can create an account | `ALLOW_SIGN_UP=false` closes it for everyone; existing accounts keep signing in |
| Invite list | Off | `ALLOWED_EMAILS=a@example.com,b@example.com` limits sign-up to those emails (`WAITLIST_URL` adds an "apply" link) |
| PostHog analytics | Off; nothing is sent | `POSTHOG_KEY` |
| Slack and Discord sharing | Off | `SLACK_WEBHOOK_URL`, `DISCORD_WEBHOOK_URL` |

To run a private instance: sign up once, then set `ALLOW_SIGN_UP=false` and restart.

Rate limits (sign-in, password-protected pastes) count per visitor IP. Tell the app where that
comes from with `CLIENT_IP_SOURCE`:

| What's in front of the app | Settings |
| --- | --- |
| Nothing: people connect to port 3000 | `CLIENT_IP_SOURCE=direct` (the default) |
| A reverse proxy that appends to `X-Forwarded-For` (nginx, Caddy, Traefik, Coolify) | `CLIENT_IP_SOURCE=x-forwarded-for` and `TRUSTED_PROXIES=private` (or the proxy's addresses), or `TRUSTED_PROXY_HOPS=<number of proxies>` |
| A reverse proxy that sets `X-Real-IP` | `CLIENT_IP_SOURCE=x-real-ip` |
| Cloudflare, with the origin closed to everything else | `CLIENT_IP_SOURCE=cloudflare` |

`direct` can't be fooled by headers, but behind a proxy it sees only the proxy's address, so every
visitor shares one limit until you pick the matching source. A header-based source is only safe
if clients can't reach the app without passing through whatever sets that header. Details are in
`apps/web/.env.example`.

Self-hosted instances send no analytics. PostHog only loads when `POSTHOG_KEY` is set (see
`apps/web/.env.example`), and the key is read at runtime, so the same image never phones home.

The Analytics page counts views, unique visitors, code copies, raw reads, referrers, devices and
countries in your own database, with no cookies and nothing sent anywhere else. A visitor is a
daily hash of the address and browser under a random salt that is deleted after a day, so nobody
can link it back to a person or follow one across days. Only the referrer's host is kept, never the
path. Crawlers, link previews, prefetches and scripts aren't counted as views. Countries come from
the CDN's header (`CF-IPCountry`, `X-Vercel-IP-Country` or `CloudFront-Viewer-Country`), so there is
no country data without one in front. `GET /api/stats?range=7d|30d|90d|24h` returns the same
figures as JSON for the signed-in account.

Share links live on the app's own domain by default (`paste.example.com/k7Qe2x`). To give them a
separate domain, for example a short one:

1. Point that domain at the same container too (a second domain on the Coolify resource, or another
   `server_name`/host rule in your reverse proxy).
2. Set `SHARE_URL=https://short.example` on the app.

Copied links then use the share domain. On it, share pages and raw files are served as usual, and
app pages (`/`, `/sign-in`, `/dashboard`, …) redirect to `BETTER_AUTH_URL` (`apps/web/proxy.ts`).

## Scaling

See [the early-growth operations guide](docs/scaling.md) for connection budgets, account limits,
retention, telemetry, migration rollout, and deployment coordination at 100k pastes.

## Load testing

See [the read-load suite](apps/web/load/README.md) for the deterministic 100k-paste seeder, k6
scenarios, configurable thresholds, and baseline reports. Run it against a dedicated load-test
database and a production build.

## CI

`.github/workflows/ci.yml` runs on every pull request and push to `main`: `biome ci`, lint,
typecheck, `next build`, a production Docker build and startup test, Bun integration tests, and
Chromium browser tests against an isolated PostgreSQL database and production build.

### Container releases

Push a semantic version tag, such as `v1.2.3` (or `1.2.3`), to publish a release. The
`Publish Docker image` workflow builds and tests both architectures against fresh Postgres
databases, then publishes one multi-platform image to GHCR using GitHub's built-in token.
Stable releases get `1.2.3`, `1.2`, `1` (except major zero) and `latest` tags. Prereleases such as
`v1.3.0-beta.1` get only `1.3.0-beta.1`, so they do not replace stable tags. Publish stable tags in
version order, letting each workflow finish before the next; the last completed stable release
updates `latest`.

After the first publish, a repository owner must set the `sniptide` package's visibility to
**Public** in [GitHub's package settings](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry#pushing-container-images) so self-hosters can pull it without signing in. Release
tags do not create a GitHub Release automatically.

The same container test runs on PRs. To run it locally after building:

```bash
docker build -t sniptide:test .
bash scripts/test-docker.sh sniptide:test
```

The test creates and removes its own containers and network, without using host ports or an
existing database.

## Checks

Browser regression tests use TesterArmy e2e with Chromium. See
[the browser test guide](apps/web/tests/README.md) for the isolated database setup, local commands,
and CI reports. Run `bun run test:e2e` after setting `E2E_DATABASE_URL`.

```bash
bun run build
bun run lint
bun run typecheck
bun run format
```

## Workspace

- `apps/web`: Next.js app, auth route at `app/api/auth/[...all]`, health check at `app/api/health`
- `packages/auth`: better-auth setup on the Drizzle adapter
- `packages/cli`: code capture and restore CLI, with a dependency-free Node.js executable
- `packages/mcp`: shared MCP tools, remote HTTP transport and local stdio executable
- `packages/db`: Drizzle schema, Postgres client and migrations
- `packages/ui`: `@sniptide/ui`, the shared shadcn (Base UI) components, brand pieces and Sniptide
  theme. Published to npm for the website repo; see `packages/ui/README.md`
- `packages/typescript`: shared TypeScript configuration

## License

[AGPL-3.0](LICENSE). You can self-host and modify Sniptide; if you run a modified version as a
network service, you have to publish your changes under the same license.
