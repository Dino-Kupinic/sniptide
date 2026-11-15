# Agent-traffic results and the Rust question

Measured on 15 November 2026 with the scenarios of the
[agent-load suite](../../apps/web/load/README.md#measure-agent-traffic). The before column is
`main` at `c07a9e3`. The after column adds the search change (WRK-565) and the round-trip change
(WRK-566).

Setup: 100,000 pastes across 40 accounts and 309 MB of content, with the 10,000-paste account
(30 MB) sending the reads and searches. One production Next.js process ran with the default pool
of ten connections. PostgreSQL 17 ran in Docker Desktop with five CPUs. k6 1.5.0, the app and
the database shared an Apple M1 Pro with eight cores, so these numbers compare two builds on one
machine and are not a capacity claim. Each run lasted 15 seconds.

## What a request costs

Requests per second and app CPU are from the runs with 16 clients, where the process is
saturated. The p50 is from the runs with one client.

| Request | Statements before | after | p50 before | after | Requests/s before | after | App CPU ms/request before | after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| API read | 8 | 2 | 8.1 ms | 4.2 ms | 555 | 1,165 | 1.68 | 0.88 |
| API list | 7 | 2 | 7.9 ms | 4.2 ms | 595 | 1,158 | 1.63 | 0.88 |
| API search, word in every paste | 7 | 2 | 2,215 ms | 5.7 ms | 3 | 974 | 7.38 | 0.94 |
| API search, word only in titles | 7 | 2 | 2,432 ms | 163 ms | 2.7 | 31 | 10.4 | 4.0 |
| API search, word in one paste | 7 | 2 | 3,062 ms | 276 ms | 2.1 | 19 | 14.8 | 3.6 |
| API search, word in no paste | 7 | 2 | 2,959 ms | 266 ms | 2.1 | 19 | 8.9 | 3.8 |
| API create | 25 | 23 | 16.2 ms | 12.5 ms | 329 | 402 | 2.67 | 2.09 |
| MCP `tools/list` | 3 | 1 | 4.3 ms | 3.4 ms | 574 | 721 | 1.82 | 1.59 |
| MCP `read_snippet` | 8 | 2 | 8.9 ms | 5.7 ms | 462 | 882 | 2.18 | 1.24 |
| MCP `search_snippets` | 7 | 2 | 2,190 ms | 6.8 ms | 3 | 745 | 11.0 | 1.47 |
| MCP `create_snippet` | 25 | 23 | 16.8 ms | 13.3 ms | 298 | 356 | 3.19 | 2.60 |

Create counts include the statements that triggers run. With 64 clients the throughput stays the
same and latency grows fourfold, because the extra clients only wait.

## Where the time went

- **Search scanned the whole instance.** The file check sat in an `EXISTS` inside an `OR`, and
  PostgreSQL ran it as one hashed scan of every account's files: 3.6 seconds in the plan, for
  every word. It is now a probe of the caller's pastes that stops at a full page. A word that
  matches few pastes still reads all of the caller's code, about 270 ms for 30 MB.
- **A request was mostly round trips.** PostgreSQL executed a read in 0.2 ms, while the app
  waited 5 ms for eight statements, three of them commits. One Node process reached a full core
  at about 555 reads per second.
- **The configuration was validated on every call.** `getConfig()` parsed the whole environment
  each time, about 7% of the CPU of a read. Production now validates it once.
- **The rest is spread thin.** In a profile of the changed build, the app's own modules take
  under 5% of the CPU. Node's HTTP and stream code takes about 25%, the Next.js runtime 25%, and
  Drizzle and the PostgreSQL driver 19%.
- **A shared paste page costs 15 to 18 ms of CPU**, so one process renders about 70 pages a
  second. Shared reads are rate limited by address, which is why the suite reports refusals for
  them from one machine.

## Should a service move to Rust

Sniptide has one service, the Next.js app. The candidate for a rewrite is the token API and MCP
endpoint inside it. To measure what a rewrite would buy, the read endpoint was written twice more
with the same two statements and the same JSON: once on `node:http` with postgres.js, and once in
Rust with axum and tokio-postgres. All three returned the same paste.

| Implementation | Requests/s with 16 clients | p50 with 1 client | CPU ms/request | CPU cores used |
| --- | ---: | ---: | ---: | ---: |
| Next.js app, after the changes | 1,228 | 4.3 ms | 0.78 | 0.96 |
| Node, no framework | 4,094 | 1.5 ms | 0.18 | 0.73 |
| Rust | 3,919 | 1.3 ms | 0.12 | 0.46 |

The recommendation is to keep TypeScript.

- Rust uses about a third less CPU than Node for the same work. The framework layers cost four
  times more than the language does, and Node can shed them too.
- Both prototypes stop near 4,000 reads per second, where PostgreSQL is the limit. Every read
  commits two transactions: one for the usage counter and rate limit, one for the read count.
  A faster app process cannot pass that.
- A second codebase would duplicate the access rules, moderation filters, quotas and contracts
  that the web app, the API and MCP share today, and each copy would need its own tests.

What to do instead, in order:

1. Run more app processes. The app is stateless, and [the operations guide](../scaling.md)
   covers the connection budget. Two processes double the numbers above until the database is
   the limit.
2. Move the per-request counters out of the request. Counting usage, rate limits and reads in
   memory and writing them every second or so removes the two commits from a read. Rate limits
   are then approximate across processes for that interval. This is done; see the follow-up
   below.
3. Add an index for code search if accounts grow. A `pg_trgm` index on file content answers a
   rare word without reading the account, and costs index space and slower writes.
4. If one process must serve more, serve `/api/v1` and `/api/mcp` from a small Node server that
   imports the same modules. The prototype shows about four times the throughput per core with
   no second language.

A Rust rewrite becomes worth another look when the app tier is still the limit after these
steps, and CPU cost per request matters more than the cost of two codebases.

## Follow-up: counters, MCP setup and creates

A later change (WRK-570) took three of the steps above and was measured the same way, on the
same machine, against `main` at `33d1604`. Requests per second and CPU are with 16 clients.

| Request | Requests/s before | after | App CPU ms/request before | after | PostgreSQL ms/request before | after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| API read | 911 | 1,004 | 1.05 | 1.03 | 0.18 | 0.11 |
| API list | 903 | 968 | 1.08 | 1.05 | 0.24 | 0.17 |
| API create | 263 | 402 | 2.83 | 2.05 | 1.27 | 0.87 |
| MCP `tools/list` | 618 | 802 | 1.79 | 1.23 | 0.10 | 0.03 |
| MCP `read_snippet` | 645 | 840 | 1.52 | 1.11 | 0.21 | 0.13 |
| MCP `create_snippet` | 261 | 412 | 3.22 | 2.04 | 1.09 | 0.82 |

The read and list rows are the mean of two runs. This session's runs were slower overall than
the tables above, so compare columns within this table only.

- **Counters are written once a second.** A read commits nothing. Over two 15-second runs of
  reads and lists PostgreSQL wrote about 32,000 WAL records where it wrote about 172,000. One
  process gains under 10%, because it is limited by its own CPU and still sends two statements.
  The gain is the database headroom that several processes share.
- **The MCP server is reused.** Building it for each request registered nine tools and three
  prompts again. A call now borrows an idle server.
- **A create sends 9 statements where it sent 11.** The response is built from what was written,
  and the account's totals come from the trigger-kept row, so a create no longer sums every paste
  the account owns.

## Limits of these numbers

The generator shared the machine with the app and the database, and Docker Desktop adds latency
to every round trip. File content is synthetic and compresses well. Each scenario ran alone, so
mixed traffic and contention between reads and writes are not measured. The prototypes implement
one endpoint and skip request logging, admission control and telemetry, which the app keeps.
