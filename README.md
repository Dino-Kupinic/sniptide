# Sniptide

Code snippet sharing at sniptide.com. A Bun + Turborepo monorepo with one Next.js app, run as a
Docker container on Coolify with Cloudflare in front, backed by Postgres.

## Setup

```bash
bun install
cp apps/web/.env.example apps/web/.env.local   # then set BETTER_AUTH_SECRET
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
  - optional: `SHARE_PROXY_SECRET`, a random string shared with the website so it can pass the
    visitor's IP (`X-Sniptide-Client-IP`) on share pages it proxies, for the unlock rate limits
- **Domain:** `https://app.sniptide.com`.

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
BETTER_AUTH_SECRET=$(openssl rand -hex 32) docker compose --profile app up -d --build
```

## Self-hosting

Sniptide is the app container plus Postgres. `docker-compose.yml` runs both:

```bash
export BETTER_AUTH_SECRET=$(openssl rand -hex 32)   # keep it; sessions depend on it
export BETTER_AUTH_URL=https://paste.example.com     # the URL people open
docker compose --profile app up -d
```

Put your reverse proxy (or Coolify) in front of port 3000, and back up the `postgres` volume
(for example with `pg_dump`). Set `POSTGRES_PASSWORD` to change the database password.

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

## CI

`.github/workflows/ci.yml` runs on every pull request and push to `main`: `biome ci`, lint,
typecheck, `next build`, and a `docker build` of the production image.

## Checks

```bash
bun run build
bun run lint
bun run typecheck
bun run format
```

## Workspace

- `apps/web`: Next.js app, auth route at `app/api/auth/[...all]`, health check at `app/api/health`
- `packages/auth`: better-auth setup on the Drizzle adapter
- `packages/db`: Drizzle schema, Postgres client and migrations
- `packages/ui`: `@sniptide/ui`, the shared shadcn (Base UI) components, brand pieces and Sniptide
  theme. Published to npm for the website repo; see `packages/ui/README.md`
- `packages/typescript`: shared TypeScript configuration

## License

[AGPL-3.0](LICENSE). You can self-host and modify Sniptide; if you run a modified version as a
network service, you have to publish your changes under the same license.
