# Sniptide

Code snippet sharing at sniptide.com. A Bun + Turborepo monorepo with one Next.js app, run as a
Docker container on Coolify with Cloudflare in front, backed by SQLite (libSQL).

## Setup

```bash
bun install
cp apps/web/.env.example apps/web/.env.local   # then set BETTER_AUTH_SECRET
bun dev
```

The app applies database migrations itself when it starts (`apps/web/instrumentation.ts`), so the
local database at `apps/web/data/sniptide.db` is created and kept current by `bun dev`.

GitHub and Google sign-in are optional: set `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` and
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` to turn them on. Until then their buttons render
disabled.

## Database

The schema lives in `packages/db/src/schema`. After changing it:

```bash
bun --filter @workspace/db db:generate   # drizzle-kit writes packages/db/migrations/<timestamp>_<name>/
```

The next start of the app (locally or in production) applies the new migration.
`bun --filter @workspace/db db:migrate` applies them without starting the app. Auth tables are
generated from better-auth's core schema (`packages/db/src/schema/auth.ts`); regenerate them when
adding better-auth plugins.

Keep migrations additive (new tables and columns) where possible: the old container keeps
serving until the new one is healthy, and it runs against the migrated database.

## Deploy

Coolify builds the `Dockerfile` from `main` and runs it. One-time setup of the Coolify app:

- **Source:** this repository, branch `main`, build pack **Dockerfile**, auto-deploy on push.
- **Port:** `3000`. **Health check:** `GET /api/health`.
- **Persistent storage:** a volume mounted at `/data` (holds `sniptide.db`).
- **Environment variables:**
  - `BETTER_AUTH_SECRET`: a long random string (`openssl rand -hex 32`)
  - `BETTER_AUTH_URL`: `https://sniptide.com`
  - optional: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`,
    `GOOGLE_CLIENT_SECRET`
- **Domain:** `https://sniptide.com`.

`DATABASE_URL` defaults to `file:/data/sniptide.db` in the image. Back up the `/data` volume
(Coolify can schedule volume backups). SQLite runs in WAL mode, so a manual copy should include
`sniptide.db-wal` too, or be taken with the app stopped.

Cloudflare handles DNS and proxies the domain to the server (orange cloud), with SSL/TLS set to
**Full (strict)**.

To try the production image locally:

```bash
docker build -t sniptide .
docker run -p 3000:3000 -v sniptide-data:/data \
  -e BETTER_AUTH_SECRET=$(openssl rand -hex 32) -e BETTER_AUTH_URL=http://localhost:3000 sniptide
```

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
- `packages/db`: Drizzle schema, libSQL client and migrations
- `packages/ui`: `@sniptide/ui`, the shared shadcn (Base UI) components, brand pieces and Sniptide
  theme. Published to npm for the website repo; see `packages/ui/README.md`
- `packages/typescript`: shared TypeScript configuration

## License

[AGPL-3.0](LICENSE). You can self-host and modify Sniptide; if you run a modified version as a
network service, you have to publish your changes under the same license.
