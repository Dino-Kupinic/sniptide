import { mkdir } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createDb } from "@workspace/db"
import { sql } from "drizzle-orm"

// Runs agents.js once per scenario and concurrency, and splits the cost of a request between the
// app process and PostgreSQL. A closed loop: each client sends its next request when the last one
// returns, so requests per second is what the server sustained, and latency is latency at that
// load.
const url = process.env.LOAD_DATABASE_URL
if (!url || !new URL(url).pathname.endsWith("_loadtest"))
  throw new Error("LOAD_DATABASE_URL must name a dedicated database ending in _loadtest")
const base = process.env.LOAD_BASE_URL ?? "http://127.0.0.1:3100"
if (!process.env.METRICS_TOKEN) throw new Error("Set METRICS_TOKEN to the app's metrics token")
const directory = path.resolve(
  process.env.LOAD_ARTIFACT_DIR ?? path.join(import.meta.dir, "artifacts"),
)
const scenarios = (
  process.env.LOAD_SCENARIOS ??
  "api_read,api_list,api_search_common,api_search_title,api_search_rare,api_search_none,api_create,mcp_tools_list,mcp_read,mcp_search_common,mcp_create,shared_page,shared_raw"
).split(",")
const clients = (process.env.LOAD_CLIENTS ?? "1,16,64").split(",").map(Number)
const duration = process.env.LOAD_DURATION ?? "15s"
const seconds = Number(duration.slice(0, -1)) * (duration.endsWith("m") ? 60 : 1)
if (!/^[1-9]\d*(s|m)$/.test(duration) || seconds < 5 || seconds > 1800)
  throw new Error("LOAD_DURATION must be 5 seconds to 30 minutes, e.g. 15s")
if (clients.some((count) => !Number.isInteger(count) || count < 1 || count > 512))
  throw new Error("LOAD_CLIENTS must list whole numbers from 1 to 512")
await mkdir(directory, { recursive: true })

interface Metric {
  count: number
  sumMs: number
}
interface Snapshot {
  cpu: { user: number; system: number }
  metrics: Record<string, Metric>
}
async function snapshot(): Promise<Snapshot> {
  const response = await fetch(new URL("/api/metrics", base), {
    headers: { Authorization: `Bearer ${process.env.METRICS_TOKEN}` },
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`The metrics request failed (HTTP ${response.status})`)
  return (await response.json()) as Snapshot
}
// Statements the app sent, and how long it waited for them including time queued for a connection.
function statements(value: Snapshot) {
  let count = 0
  let ms = 0
  for (const [name, metric] of Object.entries(value.metrics)) {
    if (!name.startsWith("db:") || name === "db:transaction_acquire") continue
    count += metric.count
    ms += metric.sumMs
  }
  return { count, ms }
}

const db = createDb(url)
// Execution time inside PostgreSQL needs pg_stat_statements in shared_preload_libraries.
const statementStats = await db
  .execute(sql`create extension if not exists pg_stat_statements`)
  .then(() => db.execute(sql`select pg_stat_statements_reset()`))
  .then(
    () => true,
    () => false,
  )
const rows = []
try {
  for (const scenario of scenarios) {
    for (const count of clients) {
      // Every run starts with full rate-limit windows, so one run can't throttle the next.
      await db.execute(sql`truncate rate_limit`)
      if (statementStats) await db.execute(sql`select pg_stat_statements_reset()`)
      const summaryPath = path.join(directory, `${scenario}-${count}.json`)
      const before = await snapshot()
      const k6 = Bun.spawn(["k6", "run", "--quiet", path.join(import.meta.dir, "agents.js")], {
        env: {
          ...process.env,
          LOAD_BASE_URL: base,
          LOAD_MANIFEST: process.env.LOAD_MANIFEST ?? path.join(directory, "manifest.json"),
          LOAD_SCENARIO: scenario,
          LOAD_CLIENTS: String(count),
          LOAD_DURATION: duration,
          LOAD_SUMMARY: summaryPath,
        },
        stdout: "ignore",
        stderr: "pipe",
      })
      const [errors, exitCode] = await Promise.all([new Response(k6.stderr).text(), k6.exited])
      if (exitCode !== 0) throw new Error(`k6 failed for ${scenario}: ${errors.slice(-2000)}`)
      const after = await snapshot()
      const summary = (await Bun.file(summaryPath).json()).metrics
      const requests: number = summary.iterations.values.count
      const sent = statements(after)
      const sentBefore = statements(before)
      const cpuMs = (after.cpu.user + after.cpu.system - before.cpu.user - before.cpu.system) / 1000
      const [postgres] = statementStats
        ? await db.execute<{ ms: number }>(
            sql`select coalesce(sum(total_exec_time), 0)::float8 as ms from pg_stat_statements
              where toplevel and query not like '%pg_stat_statements%'`,
          )
        : []
      const row = {
        scenario,
        clients: count,
        requests,
        requestsPerSecond: requests / seconds,
        p50Ms: summary.agent_latency.values.med as number,
        p95Ms: summary.agent_latency.values["p(95)"] as number,
        p99Ms: summary.agent_latency.values["p(99)"] as number,
        failedPercent: (summary.agent_failed.values.rate as number) * 100,
        appCpuMsPerRequest: cpuMs / requests,
        appCpuCores: cpuMs / 1000 / seconds,
        statementsPerRequest: (sent.count - sentBefore.count) / requests,
        databaseWaitMsPerRequest: (sent.ms - sentBefore.ms) / requests,
        postgresMsPerRequest: postgres ? postgres.ms / requests : null,
      }
      rows.push(row)
      console.info(
        `${scenario} with ${count} clients: ${row.requestsPerSecond.toFixed(1)} requests/s, p95 ${row.p95Ms.toFixed(1)} ms, ${row.failedPercent.toFixed(2)}% failed`,
      )
    }
  }
} finally {
  await db.$client.end()
}

const fixed = (value: number | null, digits: number) => value?.toFixed(digits) ?? "n/a"
const table = rows
  .map(
    (row) =>
      `| ${row.scenario} | ${row.clients} | ${fixed(row.requestsPerSecond, 1)} | ${fixed(row.p50Ms, 1)} | ${fixed(row.p95Ms, 1)} | ${fixed(row.p99Ms, 1)} | ${fixed(row.failedPercent, 2)} | ${fixed(row.appCpuMsPerRequest, 2)} | ${fixed(row.appCpuCores, 2)} | ${fixed(row.statementsPerRequest, 1)} | ${fixed(row.postgresMsPerRequest, 2)} |`,
  )
  .join("\n")
await Bun.write(path.join(directory, "agents.json"), JSON.stringify(rows, null, 2))
await Bun.write(
  path.join(directory, "agents.md"),
  `# Agent-load results\n\nStarted: ${new Date().toISOString()}. Target: ${base}. Host: ${os.platform()} ${os.arch()}, ${os.cpus().length} logical CPUs, ${(os.totalmem() / 2 ** 30).toFixed(1)} GiB RAM. Each run lasted ${duration}.\n\n| Scenario | Clients | Requests/s | p50 ms | p95 ms | p99 ms | Failed % | App CPU ms/request | App CPU cores | Statements/request | PostgreSQL ms/request |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n${table}\n\nApp CPU is the Node process's user and system time. PostgreSQL time is statement execution from pg_stat_statements and leaves out network and commit waits. The generator, the app and the database shared this host unless the target is remote.\n`,
)
console.info(`Report: ${path.join(directory, "agents.md")}`)
