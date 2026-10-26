# Performance audit changes

The October 2026 audit found redundant editor work, per-file Git processes, unused analytics
queries, and unbounded import or maintenance work. The changes keep each operation in its
existing owner, with shared byte budgets for imports, maps for grouped files, and private SMTP
connections for email consumers.

## Behavior checks

| Path | Change | Regression coverage |
| --- | --- | --- |
| Editor drafts | Serialize backups at flush and cache the autosaver's current key | `draft-writer.test.ts`, `autosaver.test.ts` cover discard, undo, remount ordering, and edits during a save |
| Editor rendering | Cache immutable file sizes and use bounded markup for oversized content | `editor-rendering.test.ts`, `editor-performance.e2e.ts` check limits, visible content, and focus across the threshold |
| Notification feed | Share overlapping reads and invalidate them around mutations | `notification-reader.test.ts` covers concurrent reads, locale changes, and mutation races |
| CLI capture | Batch ignore checks and reuse overlapping selections | `packages/cli/test/cli.test.ts` exercises ignored candidates, unsafe paths, and one batch for a fixture that previously spawned 66 checks |
| Gist imports | Stream at most two raw files, sharing the paste byte budget | `gist.test.ts` covers cancellation, inline/raw totals, empty content, and split UTF-8 characters |
| Analytics export | Read only series data and reuse a date formatter | `paste-analytics.test.ts` compares CSV series with full reports across ranges and scopes |
| Paste reads | Overlap independent hydration reads and reuse file metadata | `list-page.test.ts` checks query counts, revision pages, file ordering, and UTF-8 sizes |
| API pagination | Group files once and issue precise timestamp cursors | `api-v1.test.ts` covers microsecond ties and existing millisecond cursor traversal |
| Notification email | Check stale jobs before recipient queries, bound consumers, and reuse each consumer's SMTP connection | `notification-delivery.test.ts` checks claim limits, concurrency, connection reuse, and stalled-peer isolation |
| Analytics maintenance | Commit daily progress and prune in bounded transactions | `rollup-batches.test.ts` checks interruption and resumption; `paste-analytics.test.ts` checks report equivalence |

Web test filenames in the table are under `apps/web/test/`. Browser tests are under
`apps/web/tests/`. See [development](development.md) for the test database and command setup.

## Pagination plans and upgrade cost

The pagination index choice was checked on PostgreSQL 14.20 with 10,000 disposable paste rows.
The old truncated timestamp ordering required a sequential scan and sort. Raw timestamps with
the previous indexes still required an incremental sort for lists and a scan/sort for collection
reads. The new composite indexes produced direct index scans without a sort.

The final check used prepared statements with bound owner, moderation, and timestamp values and
`plan_cache_mode=force_generic_plan`. Both indexes restrict only `deleted_at IS NULL`; moderation
remains a query predicate because a generic plan cannot prove a partial-index condition from a
bound moderation value. Cursor seeks also include an explicit timestamp range bound.

The additive migration creates both indexes inside a transaction. Index construction blocks
writes to the paste table while the migration runs. Existing millisecond cursors retain their
ordering until their traversal ends; newly issued cursors preserve PostgreSQL microseconds.

## Verification and limits

The unchanged baseline passed 801 database-backed web tests and 35 CLI tests. Focused checks
pin output and resource behavior rather than asserting elapsed time. Browser verification caught
textarea remounting at the large-file threshold; the final implementation keeps its DOM identity
and checks focus and selection in both directions.

The integrated branch passed `bun run check`, the production workspace build, and
`TEST_DATABASE_URL=<disposable_test_database> bun run test`. After rebasing onto the current
viewer changes and React 19.3.1, that run passed 832 web tests,
36 CLI tests, 12 MCP tests, and 7 docs tests without database skips. Seven browser tests covering
draft storage, recovery, threshold crossing, and paste flows also passed. API pagination's
19-test suite passed again after replacing an unsupported array method with an equivalent lookup.

These checks establish behavior and reduced work on their fixtures. They do not establish a
production latency or throughput improvement. Use the [read-load suite](../apps/web/load/README.md)
to compare production builds at representative data sizes. Database pool size, preview-render
concurrency, and highlighting threads retain their existing limits.

Notification delivery defaults to two consumers per process. `NOTIFICATION_EMAIL_CONCURRENCY`
accepts 1 through 10, while the shared twenty-claim limit, run budget, claim leases, and hard
per-message deadline still apply. Analytics catch-up and pruning check
`ANALYTICS_ROLLUP_TIME_BUDGET_MS`, default 2000, between committed units; one in-flight unit may
run until its database deadline.
