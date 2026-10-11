# Read-load tests

The first suite measures HTTP reads at the early-growth target. It has a deterministic fixture
layout, constant arrival rates, response-content checks, per-route latency thresholds, and JSON
and Markdown reports. k6 1.5.0 is the validated generator; install it separately from app packages.
The app should run a production build, not the development server. These scripts do not add test
routes or change production authorization.

## Prepare an isolated database

Create a **new, empty** database whose name ends in `_loadtest`, on a local or staging Postgres
instance. Seeding refuses other names and existing users. It applies real migrations, including
pg_trgm and file-byte triggers. Do not point it at the production database. A failed partial seed
is not resumed: recreate the dedicated database and rerun. The seeder never drops a database.

From the repository root:

```sh
export LOAD_DATABASE_URL=postgres://sniptide:sniptide@localhost:5432/sniptide_loadtest
export LOAD_PASSWORD='<fixture-password-at-least-12-characters>'
bun run load:seed
```

Default fixtures: 100k pastes, 40 accounts, one account with 10k pastes, public/unlisted/private
visibility, approximately 2% recent trash and 2% recently expired pastes, a notes collection per
account, 10% multi-file pastes, 45 revisions and 90 daily-view rows on 1% of pastes, and 1,000
stars belonging to the large account. Content varies from approximately 1 KiB to 190 KiB; repeated
synthetic lines compress well, so this is not a realistic physical-storage benchmark. Fixture
ownership and content are deterministic; timestamps for retention/expiry are relative to seed
time. Seed timing excludes migrations/account initialization. `LOAD_PASTE_COUNT` can range from
1,000 to 1,000,000; the large account is capped at 10k. The fixture password is hashed through the
same Better Auth helper as real sign-in. Only two fixture users have credential accounts.

`apps/web/load/artifacts/manifest.json` records counts, bytes, sample slugs and login email, without
the password. Generated artifacts are ignored by Git. `LOAD_ARTIFACT_DIR` changes the directory;
use a separate directory for each run to preserve comparison results.

## Start the app

Use this database for the app and run the production build. Keep the fixture auth secret stable
for the run. Leave SHARE_URL and COOKIE_DOMAIN unset for localhost. In a clean environment:

```sh
export DATABASE_URL="$LOAD_DATABASE_URL"
export BETTER_AUTH_URL=http://127.0.0.1:3100
export BETTER_AUTH_SECRET='<local-secret-at-least-32-characters>'
export METRICS_TOKEN='<local-monitoring-token>'
bun run build
bun run --filter web start --port 3100
```

Wait for /api/health to return 200 and startup cleanup to finish. Check resource limits, pool size,
SQL deadlines and proxy behavior match the configuration being measured. Record app/database CPU,
RAM and Postgres version alongside the report. Run the generator on a separate machine for a
staging capacity measurement; the bundled local baseline shares resources with the server and DB.

## Run and interpret

In another shell with LOAD_PASSWORD and METRICS_TOKEN set:

```sh
export LOAD_BASE_URL=http://127.0.0.1:3100
LOAD_RATE=20 LOAD_DURATION=60s bun run load:run
```

A 15-second warmup at five reads/sec precedes measured traffic. Each measured iteration sends one
request. The ten-slot mix is 30% shared HTML (including one repeated hot paste), 10% raw downloads,
10% first-page lists, 10% substring search (alternating broad and one-character terms), 10% cursor
navigation, 10% collection lists, 10% dashboard/charts, and 10% numbered deep-page jumps. Signed-in
reads use the large account. Cursor traversal uses the real token in the page response, covers up
to ten pages per virtual user, and fails correctness if the token disappears. This also makes a
change to the serialization format visible as a harness failure. Public requests clear cookies.
Setup signs in once and confirms the session; login is not part of the measured read workload.

Initial thresholds: p95 <500 ms overall **and per request kind**, overall p99 <1,000 ms, fewer than
0.5% unexpected HTTP errors, every response containing the expected fixture/heading, zero
dropped measured iterations, and at least one real cursor seek. Configurable `LOAD_P95_MS` and `LOAD_P99_MS` are provisional budgets,
not measured promises. Durations are bounded to 5 seconds through 30 minutes (seconds/minutes notation). k6 returns nonzero on threshold failure, and the wrapper preserves that
exit status while writing the report. A red result is still useful evidence; don't relax budgets
merely to get green. Per-kind p99 is available in raw metrics even though only the overall p99 is
a gate. Setup and metrics requests are excluded from custom read thresholds.

Artifacts: `report.md`, `summary.json` (including checks/thresholds), `telemetry.json` (before/after
server metrics), and `k6.log`. Treat all artifacts as operational data. Credential values are not
written by this harness; don't enable HTTP debug logging with authenticated traffic. Latency is
k6 HTTP request duration, excluding initial DNS/connect/TLS; capture browser/connection metrics
separately. Response-byte throughput is available in k6's data_received metric, not per-route byte
sizes. Compare telemetry deltas rather than cumulative values across processes.

For staging, set LOAD_BASE_URL and explicitly set LOAD_ALLOW_REMOTE=1. Use only an isolated
instance containing these fixtures. Keep rates/durations bounded and watch the app and database.
Repeat at 20 and 50 reads/sec, then increase for a separate stress exercise. Reload/restart the
app for a cold-process experiment; warmup results remain in summary.json but measured thresholds
apply only to the reads scenario. This is not a guarantee of a cold Postgres buffer cache.

## Coverage and next steps

This suite requests full server-rendered HTML and raw HTTP responses. It does not run a browser,
fetch static assets, measure hydration or replay client RSC navigation. The content assertions
are smoke-level checks, not a substitute for access-control and burn concurrency tests.

After establishing staging baselines, add separate scenarios for ordinary hot-paste counters,
burn-after-read races with unique disposable fixtures, concurrent edits through real user flows,
and cleanup/deployment overlap. Next Server Actions are build-bound; prefer browser journeys or
an intentionally versioned API for write-load coverage instead of hardcoding action identifiers.
Keep burn correctness separate from analytics throughput. Add a 30-minute soak after the short
baseline is stable. Use a small correctness smoke run in CI before adopting performance gates;
shared CI machines are unsuitable for strict capacity comparisons.

References: [arrival-rate executor](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/constant-arrival-rate/),
[k6 thresholds](https://grafana.com/docs/k6/latest/using-k6/thresholds/), and
[custom summaries](https://grafana.com/docs/k6/latest/results-output/end-of-test/custom-summary/).

The [committed local baseline](../../../docs/load-testing/baseline.md) preserves both the diagnostic
run and the repeat with unchanged budgets.
