# Develop and verify a change

Use Bun at the version in `package.json` and Node 24.8 or newer. CI uses Node 24.
Follow [AGENTS.md](../AGENTS.md) for Linear, branch naming, and cleanup.

## Set up local development

```bash
bun install
cp apps/web/.env.example apps/web/.env.local   # then set BETTER_AUTH_SECRET
printf 'BETTER_AUTH_SECRET=%s\n' "$(openssl rand -hex 32)" > .env
docker compose up -d db                        # local Postgres on localhost:5432
bun dev
```

The app applies database migrations itself when it starts (`apps/web/instrumentation.ts`), so the
local database is set up and kept current by `bun dev`.

GitHub and Google sign-in are optional: set `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` and
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` to turn them on. Until then their buttons render
disabled. The callback URLs are `<BETTER_AUTH_URL>/api/auth/callback/github` and
`<BETTER_AUTH_URL>/api/auth/callback/google`.

Open the app at `http://localhost:3000` and the docs at `http://localhost:3001`.

## Workspace

- `apps/web`: Next.js app, auth route at `app/api/auth/[...all]`, health check at `app/api/health`
- `apps/docs`: the documentation site (Next.js and Fumadocs, MDX in `content/docs`); see
  `apps/docs/README.md`
- `packages/auth`: better-auth setup on the Drizzle adapter
- `packages/cli`: code capture and restore CLI, with a dependency-free Node.js executable
- `packages/mcp`: shared MCP tools, remote HTTP transport and local stdio executable
- `packages/contracts`: shared wire contracts for the web app, CLI, and MCP server
- `packages/db`: Drizzle schema, Postgres client and migrations
- `packages/ui`: `@sniptide/ui`, the shared shadcn (Base UI) components, brand pieces and Sniptide
  theme. Published to npm for the website repo; see `packages/ui/README.md`
- `packages/typescript`: shared TypeScript configuration

## Find the owner

| Change | Start here | Related checks |
| --- | --- | --- |
| Browser paste reads and writes | `apps/web/lib/pastes/store.ts`, `actions.ts`, `mutations.ts`, `schema.ts` | Web store, action, and access tests |
| Token API | `apps/web/app/api/v1`, `apps/web/lib/api` | `apps/web/test/api-v1.test.ts`, `cli-roundtrip.test.ts` |
| Shared wire contracts | `packages/contracts/src` | CLI contract tests, MCP tests, and web API tests |
| Documentation site | `apps/docs` | `bun run test:docs` |
| CLI capture and restore | `packages/cli/src`, `packages/cli/API.md` | `bun run test:cli` |
| MCP tools and transport | `packages/mcp/src`, `apps/web/lib/api/mcp.ts` | `bun run test:mcp`, `apps/web/test/mcp.test.ts` |
| Autosave and drafts | `apps/web/lib/autosave`, `apps/web/components/paste/paste-editor.tsx` | Web autosave tests and browser editor tests |
| Database schema and migrations | `packages/db/src/schema`, `packages/db/migrations` | Web integration tests and migration tests |
| Authentication | `packages/auth/src`, `apps/web/lib/auth.ts` | Web auth tests and browser auth tests |
| Shared components and theme | `packages/ui/src` | Typecheck, browser checks, and package consumer checks |
| Routes and API documentation | `apps/web/lib/openapi.ts` | `apps/web/test/openapi.test.ts` |
| Translations | `apps/web/messages`, `apps/web/lib/i18n` | `apps/web/test/i18n.test.ts`, `action-errors.test.ts` |

Use `rg --files` to locate files and `rg` to find callers. Check the current branch before
changing a contract. Newer branches can have different owners and exports.

Browser mutations enter through server actions and the session-aware paste store. CLI and MCP
mutations enter through the token API. Both adapters pass an explicit actor and an existing
transaction to `lib/pastes/mutations.ts`, which owns creation, content replacement, sharing
settings, trash, and revision edits. Token creation keeps its idempotency receipt and response
inside the same transaction. Pure slug and expiry policy lives in `lib/pastes/links.ts`.
Trace both adapters when changing input or response contracts. Shared operations preserve
browser collaborator rights, token owner-only access, version checks, and autosave batching.
Browser edits retain capture line ranges for files whose names and contents are unchanged;
changed files clear stale ranges.

## Document the API

The HTTP endpoints Sniptide serves (raw files, unlock, reveal, health, metrics, and the token API
under `/api/v1` that the CLI uses) are documented at
`/docs/api`, rendered by [Scalar](https://scalar.com) from the OpenAPI document at
`/api/openapi.json`. The document lives in `apps/web/lib/openapi.ts`. When you add a route
handler, document it there, or list it as internal if it only serves the web app; the web test suite fails
until you do.

## Change the database schema

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
Migration rules (transactional statements only, never editing a released migration) are in
[CONTRIBUTING.md](../CONTRIBUTING.md#database-migrations).

## Account usage

`GET /api/v1/usage` returns the authenticated token owner's stored usage and request counts
for the last 30 UTC days. The request needs the `read` scope and includes itself in its count.
Each valid-token HTTP request counts once, including API errors and MCP requests. Unknown,
expired, and revoked credentials do not count. Historical counts survive token revocation.

Storage is the sum of `paste.bytes`, the UTF-8 size of each paste's current file contents.
Paste and file counts include trash, expired pastes awaiting purge, and moderated pastes.
Permanent deletion releases usage. Revision snapshots, metadata, and env groups are excluded.
Database triggers maintain the counters in the same transaction as each mutation.

The usage migration backfills existing accounts and locks the source tables while it runs.
Reconciliation visits at most 100 accounts per minute, oldest first, when their last recount
is at least 24 hours old. Replicas skip accounts another replica has locked. To recount one
account immediately, call `reconcileAccountUsage(ownerId)` from `apps/web/lib/account/usage.ts`
in a server task. The function locks the usage row before a separate statement recounts the
source rows, so concurrent changes cannot be overwritten. Request counters have no source
log to recount and are preserved by reconciliation.

## Choose the verification command

Run these commands from the repository root:

| Command | What it verifies | Requirements |
| --- | --- | --- |
| `bun run check` | Biome formatting, lint, import order, and workspace types | Installed dependencies |
| `bun run check:deps` | Unused dependency declarations and undeclared package or binary usage | Installed dependencies |
| `bun run audit:deps` | Known advisories in the complete dependency lockfile | Access to the npm advisory service |
| `bun run test:cli` | CLI behavior through its built Node executable | Node and temporary loopback HTTP listeners |
| `bun run test:mcp` | MCP tool schemas and transports | Temporary loopback HTTP listeners |
| `bun run test:docs` | Documentation site metadata and structured data | Installed dependencies |
| `bun run test:web` | Web unit tests and available integration tests | `TEST_DATABASE_URL` for database coverage |
| `bun run test:web:unit` | Non-database web cases and Node admission tests; ignores ambient database URLs | Installed dependencies and loopback listeners |
| `bun run test:web:integration` | Web cases with required database coverage and Node admission tests | A valid dedicated `TEST_DATABASE_URL` |
| `bun run test` | CLI, MCP, docs, then web tests in separate processes | Same requirements as the individual suites |
| `bun run build` | Production workspace builds | Installed dependencies |
| `bun run test:e2e` | Browser behavior | Chromium and a dedicated `E2E_DATABASE_URL` |

The test suites run in separate processes because web tests preload mocks for Next request
APIs. Use `bun run test`, rather than unfiltered `bun test` from the root, to preserve the web
working directory and preload configuration.

`test:web:unit` clears both database URLs before loading the test preload. Database cases in
mixed test files are excluded. `test:web` prints an explicit coverage skip when the URL is
absent. `test:web:integration` fails before setup when the URL is absent or invalid; CI uses
this command so database coverage cannot be omitted accidentally.

For database coverage, create a
disposable database whose name ends in `_test`, then run:

```sh
TEST_DATABASE_URL=postgres://sniptide:sniptide@localhost:5432/sniptide_test bun run test:web:integration
```

The harness migrates that database and clears accounts and related tables between tests. Do
not use an application database. The `_test` suffix belongs in the database name, not a query
parameter. Inspect skipped tests before treating a run as integration verification.
Test URLs require a single TCP host and a database name containing only letters, digits,
underscores, or hyphens before the `_test` suffix. Encoded database names, fragments, and
query parameters that override the connection target are rejected. Ordinary SSL and timeout
options remain supported. Remote dedicated test databases are allowed; the suffix does not
replace checking that the database is disposable.

To run one web test file with the correct preload and aliases:

```sh
cd apps/web
bun test ./test/paste-validation.test.ts
```

For browser setup and focused browser tests, follow [the browser guide](../apps/web/tests/README.md).
Container smoke checks use `scripts/test-docker.sh` and `scripts/test-compose.sh` after building
the image. They are separate from `bun run test`.

`bun run format` writes files. Use `bun run check` when you only want diagnostics. CI uses
`check`, CLI, MCP, and docs tests, database-backed web tests, production builds, and browser and
container checks in separate jobs.

Run `bun run check:deps` after changes to dependencies or entry points. Knip checks runtime and
development declarations across the workspaces. `knip.jsonc` includes the language generator and
browser tests, plus narrow exceptions for the shared PostCSS config and the shadcn generator.
Add new scripts to the workspace entry points instead of ignoring their dependencies.

Dependabot opens weekly dependency update PRs. Better Auth and its adapters update together, as
do Next.js and React. Major upgrades outside those groups stay separate from routine updates.
The dependency workflow checks declarations and advisories on PRs, pushes to `main`, and weekly.
Keep the Zod override until the E2E runner stops pinning an affected version. Update the override
with the runtime catalog, and verify `bun run audit:deps` after lockfile changes.

## Make an agent change reviewable

1. Read root and directory-specific `AGENTS.md` files. Read the installed Next.js guide under
   `apps/web/node_modules/next/dist/docs/` before changing Next.js code.
2. Inspect `git status --short`, the current branch, and its relationship to the intended base.
   Preserve existing local changes. Check whether a proposed fix already exists on the base.
3. Find or create the WRK issue before coding. Use its `gitBranchName` and set it to In Progress.
4. Trace the affected entry points, data contract, and tests before editing. Keep transport
   validation separate from persistence policy, and check callers before changing exports.
5. Run the focused behavior checks, then `bun run check`. Report database skips and distinguish
   checks you ran from checks that still need CI or a browser.
6. Use the Conventional Commit and PR rules in [CONTRIBUTING.md](../CONTRIBUTING.md). Follow the
   issue status transitions in [AGENTS.md](../AGENTS.md).
7. Stop owned processes and remove disposable resources. Preserve unfinished work and report
   retained resources with their paths and reasons.

Keep durable workflow facts here and executable checks in package scripts or CI. Avoid copying
the same instructions into several agent-specific files.

## Build the clients

Build and inspect the CLI executable:

```sh
bun --filter @sniptide/cli build
node packages/cli/dist/sniptide.js --help
bun run test:cli
```

Build and test the local MCP server:

```sh
bun --filter @sniptide/mcp build
bun run test:mcp
```

See the [CLI guide](../packages/cli/README.md) and [MCP guide](../packages/mcp/README.md) for usage and configuration.

## Update translations

Translations live in `apps/web/messages/<locale>/`. Each locale has the same namespaces and message
keys. Use `next-intl` translations in components and complete ICU messages for sentences with
counts or other values. Run `bun --filter web test` to check catalog completeness, arguments, and
locale selection. Existing share links and API URLs do not change with the language.

## Container publishing

Merging a PR into `main` publishes a version tag and GitHub release after CI passes. See
[the release policy](../CONTRIBUTING.md#releases) for version selection and retry behavior.
The release workflow calls `Publish Docker image`, which builds and tests both architectures
against fresh Postgres databases, then publishes one multi-platform image to GHCR.
Stable releases get `1.2.3`, `1.2`, `1` (except major zero) and `latest` tags. Prereleases such as
`v1.3.0-beta.1` get only `1.3.0-beta.1`, so they do not replace stable tags. Publish stable tags in
version order, letting each workflow finish before the next; the last completed stable release
updates `latest`. To retry an image publication, run `Publish Docker image` manually with the
existing release tag.

After the first publish, a repository owner must set the `sniptide` package's visibility to
**Public** in [GitHub's package settings](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry#pushing-container-images) so self-hosters can pull it without signing in.

The same container test runs on PRs. To run it locally after building:

```bash
docker build -t sniptide:test .
bash scripts/test-docker.sh sniptide:test
```

The test creates and removes its own containers and network, without using host ports or an
existing database.

For dedicated load tests, use the [read-load suite](../apps/web/load/README.md).
