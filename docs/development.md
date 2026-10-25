# Develop and verify a change

Start with [setup](../README.md#setup). Use Bun at the version in `package.json` and Node 24 or
newer. CI uses Node 24. Follow [AGENTS.md](../AGENTS.md) for Linear, branch naming, and cleanup.

## Find the owner

| Change | Start here | Related checks |
| --- | --- | --- |
| Browser paste reads and writes | `apps/web/lib/pastes/store.ts`, `actions.ts`, `schema.ts` | Web store, action, and access tests |
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
mutations enter through the token API with an explicit owner. Both paths use paste validation,
insertion, and budget helpers. Trace both paths when a change affects saved paste data.

## Choose the verification command

Run these commands from the repository root:

| Command | What it verifies | Requirements |
| --- | --- | --- |
| `bun run check` | Biome formatting, lint, import order, and workspace types | Installed dependencies |
| `bun run test:cli` | CLI behavior through its built Node executable | Node and temporary loopback HTTP listeners |
| `bun run test:mcp` | MCP tool schemas and transports | Temporary loopback HTTP listeners |
| `bun run test:docs` | Documentation site metadata and structured data | Installed dependencies |
| `bun run test:web` | Web unit tests and available integration tests | `TEST_DATABASE_URL` for database coverage |
| `bun run test` | CLI, MCP, docs, then web tests in separate processes | Same requirements as the individual suites |
| `bun run build` | Production workspace builds | Installed dependencies |
| `bun run test:e2e` | Browser behavior | Chromium and a dedicated `E2E_DATABASE_URL` |

The test suites run in separate processes because web tests preload mocks for Next request
APIs. Use `bun run test`, rather than unfiltered `bun test` from the root, to preserve the web
working directory and preload configuration.

Without `TEST_DATABASE_URL`, web integration tests skip. For database coverage, create a
disposable database whose name ends in `_test`, then run:

```sh
TEST_DATABASE_URL=postgres://sniptide:sniptide@localhost:5432/sniptide_test bun run test:web
```

The harness migrates that database and clears accounts and related tables between tests. Do
not use an application database. The `_test` suffix belongs in the database name, not a query
parameter. Inspect skipped tests before treating a run as integration verification.

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
