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
- `apps/extension`: Sniptide for Chrome, a Manifest V3 extension that saves a selection as a paste.
  `bun --filter extension build` writes the unpacked extension to `apps/extension/dist`; see
  `apps/extension/README.md`
- `packages/auth`: better-auth setup on the Drizzle adapter
- `packages/cli`: the `sniptide` CLI for capture, restore, agent skills and `.env` sync, built as a
  dependency-free Node.js executable
- `packages/mcp`: shared MCP tools, remote HTTP transport and local stdio executable
- `packages/contracts`: shared wire contracts for the web app, CLI, and MCP server
- `packages/db`: Drizzle schema, Postgres client and migrations
- `packages/sdk`: `@sniptide/sdk`, the JavaScript and TypeScript client for the token API
- `packages/sdk-python`: `sniptide`, the Python client for the token API
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
| SDKs | `packages/sdk/src`, `packages/sdk-python/sniptide` | `bun run test:sdk` |
| Browser extension | `apps/extension/src`, with the OAuth and paste rules in `src/lib` | `bun run test:extension`, then load `apps/extension/dist` in Chrome |
| MCP tools and transport | `packages/mcp/src`, `apps/web/lib/api/mcp.ts` | `bun run test:mcp`, `apps/web/test/mcp.test.ts` |
| Autosave and drafts | `apps/web/lib/autosave`, `apps/web/components/paste/paste-editor.tsx` | Web autosave tests and browser editor tests |
| Database schema and migrations | `packages/db/src/schema`, `packages/db/migrations` | Web integration tests and migration tests |
| Authentication | `packages/auth/src`, `apps/web/lib/auth.ts` | Web auth tests and browser auth tests |
| Shared components and theme | `packages/ui/src` | Typecheck, browser checks, and package consumer checks |
| Routes and API documentation | `apps/web/lib/openapi.ts` | `apps/web/test/openapi.test.ts` |
| Translations | `apps/web/messages`, `apps/web/lib/i18n` | `apps/web/test/i18n.test.ts`, `action-errors.test.ts` |
| Emails | `apps/web/lib/email`, previews in `apps/web/emails` | `apps/web/test/email-templates.test.ts`, `notification-delivery.test.ts` |

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

## Change an email

Each email's words live in `apps/web/messages/<locale>/email.json`, one catalog per language, and
`apps/web/lib/email/content.ts` turns them into one object per email. The React Email layout
in `layout.tsx` and the plain-text version in `render.tsx` both render from it, so the HTML and
plain-text parts can't drift apart. Brand colors are repeated in `theme.ts`, because email clients
can't read the CSS variables in `globals.css`. Change a token in `globals.css` first. The logo
images in `apps/web/public/email` are the brand lockup rendered at three times their 143 by 24
pixel size, in blue and ink for light mode and white for dark mode.

To see every email with sample data, run the React Email preview server:

```bash
bun --filter web email   # http://localhost:3002
```

Check a change in light and dark mode and at phone width before you open a pull request.
`email-templates.test.ts` fails when the HTML and plain text stop carrying the same sentences and
links. Notification emails never include a paste's title, slug, contents or the person behind an
event; `notification-delivery.test.ts` checks that against real SMTP delivery.

## Document the API

The HTTP endpoints Sniptide serves (raw files, unlock, reveal, health, metrics, and the token API
under `/api/v1` that the CLI uses) are documented at
`/docs/api`, rendered by [Scalar](https://scalar.com) from the OpenAPI document at
`/api/openapi.json`. The document lives in `apps/web/lib/openapi.ts`. When you add a route
handler, document it there, or list it as internal if it only serves the web app; the web test suite fails
until you do.

## Update the documentation

A change that alters what a reader sees, sends, or configures updates the documentation in the
same pull request. Write and review pages with the
[documentation style guide](documentation-style-guide.md), and finish with its publication
checklist. The pages live in `apps/docs/content/docs`, and each folder's `meta.json` sets the
sidebar order.

| When you change | Update |
| --- | --- |
| Paste, collection, sharing, expiry, burn, revision, secret, or analytics behavior | The matching page in `core-concepts/` |
| Settings screens or paste defaults | `settings.mdx` |
| Routes, scopes, limits, or errors under `/api/v1` | `api-tokens.mdx`, `api-reliability.mdx`, and `apps/web/lib/openapi.ts` |
| MCP tools, prompts, or the OAuth flow | `mcp.mdx` and `oauth.mdx` |
| CLI commands or options | `cli.mdx` and `packages/cli/API.md` |
| The TypeScript or Python SDK | The pages in `sdks/` |
| The browser extension in `apps/extension` | `browser-extension.mdx` |
| Skills or the agent plugin in `skills/` | `mcp.mdx#install-the-agent-plugin` |
| Variables in `apps/web/.env.example` | `self-hosting/configuration.mdx` |
| The image, `docker-compose.yml`, or `deploy/` | The matching page in `self-hosting/` |
| A new failure a reader can hit | A row in `troubleshooting.mdx` |

`bun run test:docs` checks the parts that drift mechanically, so a missing update fails the
suite:

- Every internal link and heading anchor resolves, and every page is in a sidebar.
- Every variable in `apps/web/.env.example` appears in the configuration page.
- Every registered MCP tool and prompt appears in the MCP page.
- Every CLI command and option appears in the CLI page.
- Every `/api/v1` route and method appears in the API tokens page.

The checks live in `apps/docs/lib/content.test.ts`. When one fails, document the new item rather
than loosening the check. The checks can't judge wording, completeness, or whether an example
still works. Review those by hand, and run changed examples against a local instance before you
publish them. If you can't verify a claim, say so in the page or the pull request instead of
choosing a plausible answer. Run `bun --filter docs build` after editing MDX, because the tests
read the files as text and don't compile them.

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
| `bun run test:extension` | The extension's OAuth flow, token renewal and paste rules against a stand-in instance | Installed dependencies |
| `bun run test:docs` | Documentation site metadata, structured data, links, and drift against the code | Installed dependencies |
| `bun run test:web` | Web unit tests and available integration tests | `TEST_DATABASE_URL` for database coverage |
| `bun run test:web:unit` | Non-database web cases and Node admission tests; ignores ambient database URLs | Installed dependencies and loopback listeners |
| `bun run test:web:integration` | Web cases with required database coverage and Node admission tests | A valid dedicated `TEST_DATABASE_URL` |
| `bun run test` | CLI, MCP, docs, web, SDK, then extension tests in separate processes | Same requirements as the individual suites |
| `bun run build` | Production workspace builds | Installed dependencies |
| `bun run verify` | `check`, then `test`, then the docs build: the local gate before a pull request | Same requirements as `test` |
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
Keep the minimatch override until shadcn's ts-morph dependency accepts a patched version
(11.0.1 or newer for GHSA-g3hv-75wg-m249). Verify shadcn and ts-morph glob discovery when changing it.

## Make an agent change reviewable

An agent works in a loop that it can check by itself: each step ends in a result the agent can
observe, and the change isn't done until every check below has run.
Follow [Context discipline](../AGENTS.md#context-discipline) to keep reads and tool output focused
throughout the loop.
Write comments and pull request descriptions with
[Maintainer-facing prose](../AGENTS.md#maintainer-facing-prose).

1. Read root and directory-specific `AGENTS.md` files. Read the installed Next.js guide under
   `apps/web/node_modules/next/dist/docs/` before changing Next.js code.
2. Inspect `git status --short`, the current branch, and its relationship to the intended base.
   Preserve existing local changes. Check whether a proposed fix already exists on the base.
3. Find or create the WRK issue before coding. Use its `gitBranchName` and set it to In Progress.
4. Trace the affected entry points, data contract, and tests before editing. Keep transport
   validation separate from persistence policy, and check callers before changing exports.
5. Write or update a test that fails without the change, then make it pass. For a bug, reproduce
   the failure first.
6. Update the documentation as [Update the documentation](#update-the-documentation) describes,
   including `apps/web/lib/openapi.ts` for route changes and the translations for new interface
   text.
7. Run the focused checks for the area from [Find the owner](#find-the-owner), then
   `bun run verify`. Add `bun run test:web:integration` for database changes and
   `bun run check:deps` for dependency changes. Report database skips and distinguish checks you
   ran from checks that still need CI or a browser.
8. Review your own diff with `git diff` against the base before you commit. Remove debugging
   output, unrelated edits, and generated files the change doesn't need.
9. Use the Conventional Commit and PR rules in [CONTRIBUTING.md](../CONTRIBUTING.md). Follow the
   issue status transitions in [AGENTS.md](../AGENTS.md). Open the pull request ready for review,
   never as a draft, with the template filled in and the screenshots that
   [Show the change](#show-the-change) asks for.
10. Watch CI after you push. Reproduce a failing job locally, fix the cause, and push again. Don't
    skip or weaken a test to get a green run.
11. Stop owned processes and remove disposable resources. Preserve unfinished work and report
    retained resources with their paths and reasons.

A change is done when these hold:

- The tests cover the new behavior, and `bun run verify` passes locally.
- The documentation describes the change, and `bun run test:docs` passes.
- The pull request is open and ready for review. Its description follows the template, shows the
  change before and after, and lists what was verified and what wasn't.
- CI is green on the pull request.
- The WRK issue is In Review with the pull request linked, and moves to Done after the merge.

Keep durable workflow facts here and executable checks in package scripts or CI. Avoid copying
the same instructions into several agent-specific files.

## Show the change

Every pull request shows what changed, so a reviewer can judge it without checking out the
branch. The template's Screenshots section holds the evidence, and an agent fills it in before
asking for review.

| Change | What the Screenshots section holds |
| --- | --- |
| Interface, docs site, emails or Open Graph images | Before and after screenshots of each affected state |
| Interaction, motion or a flow across screens | The screenshots and a recording of the flow |
| CLI, MCP or API output | The output before and after, in code blocks |
| Nothing a user sees, such as CI, refactors or agent instructions | "No visible change" and the reason |

Capture every state the change touches. A layout change needs desktop at 1440px and a phone at
390px, and a color or surface change needs light and dark. Take each pair at the same viewport,
theme, locale and data, so the change is the only difference. Keep a recording to one flow of
about 15 seconds. When a recording isn't possible, such as a gesture headless Chromium can't
perform, say so and add a screenshot of each step instead.

### Capture the before state

Take the before screenshots on the base branch before you edit. When the change already exists,
run the base from a worktree on another port:

```sh
git worktree add ../sniptide-base origin/main
cd ../sniptide-base && bun install
cp ../sniptide/.env . && cp ../sniptide/apps/web/.env.local apps/web/
cd apps/web && BETTER_AUTH_URL=http://localhost:3002 bunx next dev --port 3002
```

Both checkouts share the local database. Remove the worktree with `git worktree remove ../sniptide-base` when the screenshots are done.

### Take screenshots and recordings

Write the capture script in a scratch directory outside the repository, so it never becomes a
workspace file. This one takes desktop and phone screenshots in light and dark, and records a
flow:

```js
import { chromium } from "playwright"

const base = process.env.BASE_URL ?? "http://localhost:3000"
const state = process.env.STATE ?? "after"
const viewports = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } }
const browser = await chromium.launch()

for (const [device, viewport] of Object.entries(viewports)) {
  for (const colorScheme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport, colorScheme, deviceScaleFactor: 2 })
    await page.goto(`${base}/dashboard`)
    await page.screenshot({ path: `${state}-${device}-${colorScheme}.png` })
    await page.close()
  }
}

const context = await browser.newContext({
  viewport: viewports.desktop,
  recordVideo: { dir: "recordings", size: viewports.desktop },
})
const page = await context.newPage()
await page.goto(`${base}/dashboard`)
// Drive the flow here with clicks and typing, pausing briefly between steps.
await context.close()
await browser.close()
```

The theme follows the system setting, so `colorScheme` switches between light and dark. For a
signed-in screen, sign in with a local account at the start of the script, or save
`storageState` once and pass it to each page. The recording is saved as a `.webm` file in
`recordings/` when its context closes.

### Attach the media

GitHub has no API for the attachments its web editor uploads, so agents attach media with
`scripts/attach-pr-media.sh`:

```sh
scripts/attach-pr-media.sh before-desktop-light.png after-desktop-light.png recordings/flow.webm
git push
```

The script commits the files to `.pr-media/` on the pull request branch and removes them in a
second commit. It prints Markdown with permanent links to the first commit, which GitHub keeps
in the pull request after the branch is merged and deleted. The squash merge into `main`
contains neither the files nor any change from them, and CI fails if `.pr-media/` remains.
Recordings become a GIF that plays in the description and an MP4 link, because GitHub plays
video only from its own uploads. The conversion needs `ffmpeg`.

Put the images in the template's table, one row per state:

```md
| Before | After |
| --- | --- |
| ![before-desktop-light](https://raw.githubusercontent.com/…/before-desktop-light.png) | ![after-desktop-light](https://raw.githubusercontent.com/…/after-desktop-light.png) |
```

Run the script again after a rebase or a force push, because rewriting the branch drops the
commit the links point to. People can drag files into the GitHub editor instead.

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
