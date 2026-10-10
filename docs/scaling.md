# Early-growth operations guide

Target: up to 100,000 stored pastes and tens of reads per second. These are design targets,
not measured capacity claims. Start with one app process and one PostgreSQL database; measure
before increasing replicas or introducing a separate analytics service.

## Read paths

Lists return ten summaries without file bodies. Adjacent navigation uses a cursor containing
sort value and UUID; numbered jumps still use OFFSET. Access filters are applied on every query.
Malformed or mismatched cursors fall back to numbered pagination. Counts remain exact; unfiltered
requests reuse the same count query. Counts and language facets still scan the authorized scope,
and language filtering still looks up the first file. Monitor these before denormalizing language
or caching counts across requests. Substring title/slug search uses ILIKE with literal wildcards
escaped and pg_trgm GIN indexes. Very short search terms may still scan many rows.

Sidebar, collection, and owned-detail reads use React request memoization. Detail metadata reads
only the title. Revision messages are paged in groups of twenty. Daily chart rows retain 90 days
by default (minimum 60); lifetime view totals remain intact. Revision messages are retained.

Highlighting caches derived tokens by content hash, grammar, and renderer version. Callers authorize
and read current content before using it. Each process has a ten-minute LRU cache, at most 1,024
entries, and a default 32 MiB serialized-token budget. Actual heap use is larger than serialized
size and must be monitored. Files over 200,000 UTF-8 bytes or 2,000 lines, and token payloads over
1 MiB, render as plain text. This cache is disposable and needs no replica coordination.

## Storage and write behavior

Defaults: 1 GiB of current UTF-8 file content and 10,000 pastes per account. Trash counts until
permanent deletion. Settings show these measured bytes rather than a placeholder. The quota does
not represent total physical database size: revision messages, indexes, metadata and daily views
also consume space. Monitor `database.bytes` and provision disk headroom separately.

Create/edit transactions lock the owning user row before checking quotas, serializing writers for
that account across replicas. File changes maintain `paste.bytes` through a database trigger,
including writes from an older container during rollout. Existing accounts above quota keep read
access and can delete or shrink content; new or growing content is rejected. Older app versions
maintain byte accounting but do not enforce quotas, so complete the rolling deployment promptly.

Ordinary views still synchronously update the lifetime and daily rows. Burn-after-read claims
remain synchronous and atomic. Use lock-wait and query-latency measurements for a popular paste
before deciding to batch ordinary analytics. Do not batch burn claims with analytics.

## Connection and execution budgets

All settings below are runtime environment variables except the deployment build settings.
Invalid integer settings fail explicitly. Size the pool from the database's usable connection
budget, not from traffic alone:

`maximum app connections = app processes (including overlapping releases) × DATABASE_POOL_SIZE`

Reserve connections for migrations, backups, monitoring, and administration. For example, two
replicas with ten connections each need twenty normally and forty while both releases overlap.
Transaction-acquisition duration includes pool queueing and BEGIN; individual query durations
include queueing, SQL execution, and result mapping. PostgreSQL deadlines limit SQL execution and
lock waits, not the entire HTTP request or pool queue. Configure the reverse proxy's request
and upstream deadlines to suit the service, and alert on request latency and acquisition waits.

| Setting | Default | Purpose |
| --- | --- | --- |
| DATABASE_POOL_SIZE | 10 | Connections per process |
| DATABASE_CONNECT_TIMEOUT_SECONDS | 10 | Opening a database connection |
| DATABASE_IDLE_TIMEOUT_SECONDS | 20 | Retire idle connections |
| DATABASE_MAX_LIFETIME_SECONDS | 1800 | Recycle connections |
| DATABASE_STATEMENT_TIMEOUT_MS | 10000 | SQL execution deadline |
| DATABASE_LOCK_TIMEOUT_MS | 3000 | Lock wait deadline |
| DATABASE_IDLE_TRANSACTION_TIMEOUT_MS | 15000 | Abandoned transaction deadline |
| ACCOUNT_STORAGE_BYTES | 1073741824 | Per-account current-content budget |
| ACCOUNT_PASTE_LIMIT | 10000 | Per-account paste count, including trash |
| VIEW_HISTORY_RETENTION_DAYS | 90 | Retained daily chart history |
| PURGE_BATCH_SIZE | 500 | Maximum deletions per table in each transaction |
| PURGE_TIME_BUDGET_MS | 2000 | Time between batches before ending a cleanup run |
| HIGHLIGHT_CACHE_BYTES | 33554432 | Serialized tokens per process; zero disables retention |
| SLOW_QUERY_MS | 500 | Threshold for slow-query log events |
| METRICS_TOKEN | unset | Bearer token enabling the metrics endpoint |

Cleanup runs at startup and hourly. Transactions commit between batches and use a shared advisory
lock and SKIP LOCKED. One batch can exceed the run budget up to SQL deadlines; cascaded child rows
are not bounded by the parent batch size. A trash visit removes at most 500 old pastes and excludes
older trash pending cleanup. Trash and expired pastes are permanently removed after 30 days;
daily views and stale rate-limit records are also pruned. Increasing the batch size is a measured
operational choice, not a substitute for finding slow cascades or blocked transactions.

## Telemetry

Set METRICS_TOKEN to a long random value and scrape GET /api/metrics using an Authorization bearer
header. The response is private/no-store; without a configured token the endpoint returns 404.
Keep the endpoint behind your normal access controls. It returns per-process latency histograms,
query counts/errors, transaction acquisition, memory, CPU time, event-loop delay, last cleanup
progress, database size/connections/lock waiters, and stale-paste backlog. Scrape every replica;
metrics are cumulative since process start and reset on restart. Histogram buckets are disjoint,
so aggregate buckets before deriving percentiles. CPU time is cumulative; derive utilization
from deltas. Event-loop delay percentiles cover process lifetime.

Structured request logs include normalized routes (no slugs or query strings), status, duration,
observed query count/time, and Content-Length when provided. Streaming responses often lack that
header; use proxy response-byte metrics for complete payload measurements. Slow-query logs omit
SQL and bound values. Drizzle fluent queries and execute calls are observed; raw driver calls and
auth adapter relational queries are not included in request query counts. Route instrumentation
uses Node HTTP request events, as does trusted-peer capture; an alternate server requires its own
request hook. Protect logs and metrics like operational data.

Alert on repeated SQL deadlines, rising transaction acquisition or lock waits, increasing 5xx
rates, event-loop delay, heap pressure, and purge backlog that grows across hourly runs. A backlog
with `exhausted: false` means the cleanup budget ended or another process held the lock; use
fleet-wide progress when diagnosing it. Request/query histograms and proxy metrics should supply
p95/p99 latency and traffic volume.

## Migration and rollout

Back up the database. The additive migration installs pg_trgm, adds indexes and byte accounting,
and backfills existing file sizes. The migration role must be allowed to install pg_trgm; ask your
database operator to install it first if that permission is restricted. Index creation and backfill
run in the migration transaction and can block writes. At 100k pastes, schedule a rollout window
and inspect database activity; this is not an online/concurrent index migration. Migration-only
statement/lock deadlines are five minutes/sixty seconds. On failure it rolls back and the new
container does not become ready. Restore database access or increase migration-specific budgets
through a reviewed change before retrying; do not disable application deadlines globally.

Build once and deploy the exact image to every replica of a release. Pass the commit SHA as the
DEPLOYMENT_VERSION build argument (it sets Next deploymentId). For separate builds that must share
Server Actions, supply the same stable build-time key using BuildKit secret `server_actions_key`:

```sh
# The secret file contains an AES key encoded as base64 (e.g. 32 random bytes).
docker build --build-arg DEPLOYMENT_VERSION=<commit-sha> \
  --secret id=server_actions_key,src=/secure/server-actions-key \
  -t sniptide:<commit-sha> .
```

Keep the key out of source control, build arguments, and logs. The resulting image contains the
compiled server action key and must remain private to trusted operators. Runtime-only key changes
do not change an already-built artifact. Coordinate key rotation as a release; expect open old
clients to refresh. Without a supplied key, Next generates one per build; replicas of the same
image still share it. Compose accepts DEPLOYMENT_VERSION as a build argument. Drain old instances,
retain the previous image for rollback, and verify readiness through /api/health.

## Capacity exercise before increasing traffic

On a representative staging database, seed 100k pastes with realistic file sizes, a large account,
large trash/history scopes, and a skewed popular-paste distribution. Measure cold and warm reads,
first/deep/adjacent pages, search (including one-character terms), charts, edits, quota boundaries,
burn reveals, and purge with concurrent reads. Include a rolling deploy's connection overlap.
Begin at tens of reads per second and compare request p95/p99, SQL latency, queueing, locks, heap,
event-loop delay, response bytes, and cleanup throughput. Agree on latency/error budgets before
running the exercise. No load-test results are claimed by this change. Counts/facets and hot-paste
view updates are the next redesign candidates if those measurements show pressure.
