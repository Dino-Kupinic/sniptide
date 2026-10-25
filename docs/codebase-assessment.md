# Codebase assessment for developer and agent experience

Assessment date: 2026-10-24. Tracking issue: [WRK-357](https://linear.app/dkupinic/issue/WRK-357/assess-codebase-anti-patterns-and-improve-developer-and).

The original assessment used checkout `b1cd6d5`, which was 29 commits behind and one commit
ahead of locally recorded `origin/main` at `07fdc6f`. Existing uncommitted changes were excluded from
implementation. This is a focused assessment of architecture, onboarding, tooling, tests, and
agent feedback. It is not an exhaustive correctness or security audit. No remote freshness
claim is made for `origin/main`.

## Prioritized findings

| Priority | Finding | Evidence | Next action |
| --- | --- | --- | --- |
| High | Destructive integration-test guard validates the entire URL | `apps/web/test/harness.ts` accepts a query value ending in `_test` even when the database name does not | Parse the URL and validate its protocol and database pathname before migration or cleanup. Add adversarial URL cases. |
| Medium | Browser writes discard capture line provenance | `apps/web/lib/pastes/store.ts` hydrates files without line ranges and replaces file rows during updates. The browser schema has no provenance fields. | Preserve metadata for unchanged files and add an API capture to browser edit to API read integration test. |
| Medium | Verification commands are incomplete and inconsistent | Root package scripts omitted web tests and a unified check. README listed a mutating formatter as a check. Integration CI relied on ambient Node. | Addressed in this change through root commands, CI alignment, and explicit test requirements. |
| Medium | MCP input errors lack repair details | `apps/web/lib/api/mcp.ts` replaces Zod failures with one generic message. `packages/mcp/src/client.ts` discards failed HTTP bodies. | Define stable error codes and allowlisted field paths for known validation failures. Keep arbitrary upstream bodies private. |
| Medium | Paste store has too many responsibilities | `apps/web/lib/pastes/store.ts` combines session context, persistence, public reads, sharing, revisions, and projections. Token API imports it for slug generation. | Move pure slug policy first. Extract a cohesive feature only when a change requires it, keeping behavior covered. |
| Investigate | Autosave retry lifetime outlives the editor | `apps/web/lib/autosave/use-autosave.ts` flushes on unmount without disposal. `autosaver.ts` reschedules thrown saves. | Reproduce navigation during an outage and Strict Mode remounts before choosing bounded disposal or an application-owned queue. |
| Low | Release instructions disagree | README described manual tags as the primary release path. CONTRIBUTING and `release.yml` describe automatic releases after merged-PR CI. | Addressed by linking the release policy and correcting the README. |

## Finding tracking

All seven findings are tracked as of 2026-10-25:

| Finding | Issue | Status |
| --- | --- | --- |
| Test-database guard | [WRK-358](https://linear.app/dkupinic/issue/WRK-358/validate-the-database-pathname-before-destructive-integration-tests) | Backlog |
| Capture provenance | [WRK-359](https://linear.app/dkupinic/issue/WRK-359/preserve-capture-line-provenance-during-browser-metadata-edits) | Backlog; runtime reproduction required |
| Verification workflows | WRK-357 | Implemented in this PR; not merged |
| MCP validation diagnostics | [WRK-366](https://linear.app/dkupinic/issue/WRK-366/return-actionable-validation-errors-to-mcp-agents) | Backlog |
| Paste store coupling | [WRK-367](https://linear.app/dkupinic/issue/WRK-367/reduce-coupling-in-the-paste-store-through-focused-extractions) | Backlog; maintainability refactor |
| Autosave retry lifetime | [WRK-368](https://linear.app/dkupinic/issue/WRK-368/investigate-autosave-retry-ownership-after-editor-unmount) | Backlog; investigation, not a confirmed leak |
| Release documentation | WRK-357 | Corrected in this PR; not merged |

The database guard, provenance path, MCP errors, and autosave lifetime were also inspected in
`origin/main` at `07fdc6f`. They remain relevant there. The store still combines the listed
responsibilities on that revision. Proof levels differ:

- The database guard bypass was reproduced as a pure expression, without a database connection.
  `/_test(\?|$)/.test("postgres://u:p@localhost:5432/sniptide?application_name=foo_test")`
  returns `true`, while `new URL(value).pathname` is `/sniptide`.
- Provenance loss follows from the hydration, schema, delete, and insert paths. It has not been
  reproduced against a running database in this assessment.
- The autosave concern is a lifecycle risk supported by the source. Accumulated requests or
  memory retention have not been measured.
- Store decomposition is a maintainability recommendation. File length alone does not justify
  a rewrite.

## Existing structure to retain

Browser server actions validate input and enter a session-aware store. Token API operations
receive an explicit owner. Both use paste validation, budget, insertion, and snapshot helpers.
Hosted MCP calls the API service directly instead of making loopback HTTP requests.

The CLI has structured output, stable exit statuses, dry runs, and real executable tests. MCP
tools have discoverable schemas and annotations, and tests exercise SDK transports. Strict
TypeScript and unchecked-index checks are enabled. CI already covers database access behavior,
browser flows, production containers, and Compose configuration.

A duplicated wire-contract finding in the old checkout is already addressed by
`packages/contracts` on `origin/main`, through WRK-316. It is excluded from new recommendations.
Version and draft changes were also absent from the original assessment checkout. Apply
follow-up fixes against the intended current base rather than copying an older implementation
forward.

## Improvements implemented

- `bun run check` runs the existing Biome CI checks and workspace typechecks without rewriting
  source. CI uses this command instead of a separate duplicate lint pass.
- `bun run test` runs CLI, MCP, docs, and web tests in separate processes. `bun run test:web` exposes
  the web suite from the root while preserving its working directory and preload mocks.
- Integration CI selects Node 24 explicitly before running Node subprocess tests.
- README explains database skips, distinguishes formatting from checking, and points to the
  canonical release policy.
- [The development guide](development.md) maps ownership and test entry points for contributors
  and agents. Existing user-owned agent files are preserved.

These changes add workflow entry points and documentation. They do not fix the remaining
runtime findings. With user approval, the detailed correctness findings are tracked under
WRK-357 as [WRK-358](https://linear.app/dkupinic/issue/WRK-358/validate-the-database-pathname-before-destructive-integration-tests)
for the test-database guard and [WRK-359](https://linear.app/dkupinic/issue/WRK-359/preserve-capture-line-provenance-during-browser-metadata-edits)
for capture provenance. Both include evidence, verification limits, and acceptance criteria.

## Delivery order

First, repair the destructive test guard and prove rejected URLs cannot reach database setup.
Then reproduce and fix cross-entry-point metadata loss. Improve MCP validation errors next so
agents can correct their inputs. Investigate autosave lifecycle independently. Extract store
responsibilities in small changes tied to behavior tests, rather than reorganizing the whole
application in one pass.

This order applies Encode Lessons in Structure to executable checks, Laziness Protocol to the
small workflow diff, and Prove It Works to direct command execution and explicit proof limits.

## PR verification

The workflow changes were applied separately onto current `main` at `f1578ca` on 2026-10-25.
The older demo commit and unrelated local edits are excluded. The development guide includes
shared wire contracts and the docs site, and the root test command includes docs tests.

`bun run check` passed Biome and all eight workspace typecheck tasks. Turbo reused five task
results and executed three tasks. The aggregate test command, run with `TEST_DATABASE_URL`
and `DATABASE_URL` unset, exited successfully:

| Suite | Passed | Skipped | Failed |
| --- | --- | --- | --- |
| CLI | 35 | 0 | 0 |
| MCP | 11 | 0 | 0 |
| Docs | 7 | 0 | 0 |
| Web | 336 | 461 | 0 |

The test-database, browser, production-build, and container checks remain for CI or a separate
run with the required services. These local results do not establish database behavior. The
runtime findings above retain their original evidence dates and verification limits.
