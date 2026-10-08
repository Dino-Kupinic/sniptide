# Sniptide

Code snippet sharing at sniptide.com. A Bun + Turborepo monorepo with one Next.js app deployed to
Cloudflare Workers through [OpenNext](https://opennext.js.org/cloudflare), backed by Cloudflare D1.

## Setup

```bash
bun install
cp apps/web/.dev.vars.example apps/web/.dev.vars   # then set BETTER_AUTH_SECRET
bun --filter @workspace/db db:migrate:local        # create the local D1 database
bun dev
```

GitHub and Google sign-in are optional: set `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` and
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` in `.dev.vars` (or with `wrangler secret put` in
production) to turn them on. Until then their buttons render disabled.

`next dev` gets the D1 binding and `.dev.vars` through `initOpenNextCloudflareForDev()` in
`apps/web/next.config.ts`, so local dev and the deployed Worker read the same `wrangler.jsonc`.

## Database

The schema lives in `packages/db/src/schema`. After changing it:

```bash
bun --filter @workspace/db db:generate          # drizzle-kit writes packages/db/migrations/<timestamp>_<name>/
bun --filter @workspace/db db:migrate:local     # apply to the local D1
bun --filter @workspace/db db:migrate:remote    # apply to production D1
```

Wrangler applies Drizzle's folder-per-migration layout via `migrations_pattern` in
`apps/web/wrangler.jsonc`. Auth tables are generated from better-auth's core schema
(`packages/db/src/schema/auth.ts`); regenerate them when adding better-auth plugins.

## Deploy

```bash
cd apps/web
bunx wrangler secret put BETTER_AUTH_SECRET     # once
bun run preview                                 # production build on local workerd
bun run deploy
```

Run `bun run cf-typegen` in `apps/web` after changing bindings in `wrangler.jsonc`.

## CI/CD

GitHub Actions runs two workflows:

- **CI** (`.github/workflows/ci.yml`), on every pull request and push to `main`: `biome ci`,
  lint, typecheck, and the OpenNext Worker build (which runs `next build`).
- **Deploy** (`.github/workflows/deploy.yml`), after CI passes on a push to `main`, or by hand
  from the Actions tab: applies D1 migrations to production, then builds and deploys the Worker.

Deploy needs two repository secrets, scoped to a `production` environment:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`: a token with **Workers Scripts: Edit** and **D1: Edit** on the account

Worker secrets (`BETTER_AUTH_SECRET`, OAuth credentials) stay in Cloudflare and are set once with
`wrangler secret put`; the workflow never sees them.

## Checks

```bash
bun run build
bun run lint
bun run typecheck
bun run format
```

## Workspace

- `apps/web`: Next.js app, auth route at `app/api/auth/[...all]`, Worker config in `wrangler.jsonc`
- `packages/auth`: better-auth setup on the Drizzle adapter
- `packages/db`: Drizzle schema, D1 client and migrations
- `packages/ui`: shared shadcn (Base UI) components and the Sniptide theme
- `packages/typescript`: shared TypeScript configuration
