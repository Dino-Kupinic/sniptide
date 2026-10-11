# Local read-load baseline — 11 October 2026

Started: 11 October 2026, 01:46:40 Europe/Vienna (23:46:40 UTC on 10 October).

Target: http://127.0.0.1:3100; 100000 pastes across 40 accounts; large account 10000 pastes.

Generator: k6 v1.5.0 (commit/devel, go1.25.5, darwin/arm64). Host: darwin arm64, 8 logical CPUs, 16.0 GiB RAM. One production Next.js 16.3.8 process and PostgreSQL 14.20 (Homebrew) shared this machine with k6, without container resource limits. The app used the default pool of ten connections and SQL deadlines. Production uses PostgreSQL 17, so this run does not establish its capacity. App build: commit 886d25d.

Configured rate: 20 read iterations/sec, duration 60s, following 15s warmup. Each iteration sends one measured read; setup/metrics are additional requests. Exit code: 0.

Measured reads: 1,201 in the configured 60-second window, approximately 20.0/sec; zero dropped iterations. k6’s summary counter rate includes the warmup/setup window and is not the measured arrival rate.

Overall measured p95: 71.0 ms; p99: 160.4 ms; unexpected HTTP failure rate: 0. Correctness assertion failures: 0. Cursor seeks: 105.

| Request kind | p95 ms | p99 ms | maximum ms |
| --- | --- | --- | --- |
| search | 96.4 | 151.6 | 348.8 |
| shared | 35.8 | 83.1 | 113.9 |
| deep | 92.6 | 155.6 | 189.9 |
| collection | 71.1 | 189.3 | 230.5 |
| hot | 18.9 | 31.1 | 31.3 |
| raw | 5.3 | 7.1 | 8.7 |
| list | 74.6 | 199.4 | 213.8 |
| dashboard | 73.5 | 195.2 | 213.2 |
| cursor | 109.6 | 224.1 | 293.0 |

Sanitized measured metrics, thresholds, and before/after server snapshots are preserved in [local-repeat.json](local-repeat.json). Full local generator artifacts remain ignored under apps/web/load/artifacts/.

This is an HTTP read baseline, not a browser or production capacity claim. Synthetic repeated file content compresses well in PostgreSQL. Authentication occurs once before load. All generators, app processes and database sharing a host compete for its resources. Warmup touches sampled routes but does not make every request a cache hit. Startup cleanup must finish before measurement. Writes, burn claims, simultaneous cleanup, deployments, and browser RSC navigation are not exercised.

## Retained diagnostic run

The preceding run used the same rate and duration, but a repository type check ran concurrently
on the same host. It completed 1,201 measured reads with no HTTP errors, no dropped iterations,
and no correctness failures. Overall p95 was 362.1 ms and p99 was 1,349.0 ms; search p95 was 518.5
ms. It failed the provisional overall p99 and search p95 thresholds. Its measured summary is
preserved in [local-diagnostic.json](local-diagnostic.json).

The repeat ran without competing checks and retained all latency/error budgets. It reused the
same app process and database after the diagnostic run, so caches and buffers were warmer. The
improvement cannot be attributed solely to removing the type check. Both runs are short local
observations; repeat on isolated staging hardware, then run cold-process and soak scenarios.

## Scope and next measurements

This baseline covers the large account and sampled public reads, not all accounts uniformly.
The production app's startup cleanup finished before traffic began. No sustained cleanup, edits,
burn races or deployment overlap were measured. Metrics snapshots are samples, not peak memory
measurements; event-loop percentiles cover process lifetime. File contents are synthetic and
compress well. Authentication is checked once before load, and public reads have no session cookie.

Reproduce using [the suite instructions](../../apps/web/load/README.md). Next steps are a comparable
PostgreSQL 17 staging run at 20 and 50 reads/sec, a cold-process run, and a 30-minute soak with
continuous resource metrics. Contention and browser journeys should be separate scenarios.
