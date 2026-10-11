# Browser tests

The browser suite uses pinned versions of [TesterArmy e2e](https://tester.army/e2e) and its
Playwright web engine. Tests use deterministic locators and assertions; no model, subscription,
or API key is needed. Chromium covers desktop flows and a phone-sized viewport.

## Run locally

Install dependencies from the repository root, then create a separate test database:

```bash
bun install
docker compose up -d db
docker compose exec db createdb -U sniptide sniptide_e2e
bun --filter web test:e2e:install
export E2E_DATABASE_URL=postgres://sniptide:sniptide@localhost:5432/sniptide_e2e
bun run test:e2e
```

Create the database only once. An existing local PostgreSQL installation also works. The URL must
use `localhost`, `127.0.0.1`, or `[::1]`, and its database name must end in `_e2e`. The suite creates
and deletes data, so never point it at a development or production database.

The runner starts Next.js on `http://localhost:3100`, waits for `/api/health`, and stops it after
the run. Startup applies the normal migrations. Leave port 3100 free. Locally it runs `next dev`;
with `CI=1` it runs `next start`, so build first:

```bash
bun run build
CI=1 bun run test:e2e
```

Filter tests or watch a run:

```bash
bun run test:e2e tests/auth.e2e.ts
bun run test:e2e --headed
bun run test:e2e --last-failed
```

`tests/run.ts` generates fresh test credentials and an auth secret for each invocation. The app
receives the dedicated database and test settings, with analytics and external OAuth disabled.
Fixtures create accounts through Better Auth and install real session cookies. They delete only
their own accounts afterward; cascading deletes remove their snippets and sessions. Retries use
new accounts. No production auth bypass or test endpoint is added.

## Coverage and reports

- Anonymous access to the editor redirects to sign-in.
- Sign-in rejects an incorrect password and accepts the correct one.
- Create and edit a snippet, then read its share page and raw file anonymously.
- Unlock a password-protected snippet and check that a fresh session is locked again.
- Reveal a one-time snippet and check that subsequent reads return 404.
- Create and read a snippet using the mobile editor.

Reports, JUnit output, the Markdown summary, failure traces, and server logs live in `.e2e/`
and are ignored by Git. CI runs the suite against a production build and its own PostgreSQL 17
service on PRs and pushes to `main`, publishes a job summary, and retains evidence for seven days.
Screenshots may be withheld after password entry by the framework's secret handling.

Existing Bun unit/integration tests remain under `test/` and run separately with `bun --filter web test`.

## Coding agents and optional AI exploration

The framework's skill is installed in `.agents/skills/e2e/`, with a Claude skill symlink.
Read it before adding tests; full docs also ship in `node_modules/e2e/docs/`.

The scaffold registers MCP for Claude Code and Cursor in the web app directory, using
`bun run test:e2e:mcp`. Set `E2E_DATABASE_URL` in the client's environment first. For other clients,
register the same command with `apps/web` as its working directory. MCP starts the same isolated
app and provides browser control without a model.

AI exploration is an optional later addition. Choose a model/provider, add its SDK dependency,
and configure `agents` in `e2e.config.ts` following the installed skill and the
[models guide](https://e2e.tester.army/docs/models). Keep the regression checks deterministic.
The default suite makes no model calls and disables framework telemetry.
