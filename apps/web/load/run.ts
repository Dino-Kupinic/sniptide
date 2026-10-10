import { mkdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const directory = path.resolve(
  process.env.LOAD_ARTIFACT_DIR ?? path.join(import.meta.dir, "artifacts"),
)
await mkdir(directory, { recursive: true })
const base = process.env.LOAD_BASE_URL ?? "http://127.0.0.1:3100"
const origin = new URL(base)
if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/")
  throw new Error("LOAD_BASE_URL must be a plain origin")
if (!["localhost", "127.0.0.1"].includes(origin.hostname) && process.env.LOAD_ALLOW_REMOTE !== "1")
  throw new Error("Remote targets require LOAD_ALLOW_REMOTE=1")
const version = Bun.spawnSync(["k6", "version"])
if (version.exitCode !== 0) throw new Error("Install k6 first (validated with k6 1.5.0)")
const manifestPath = path.resolve(
  process.env.LOAD_MANIFEST ?? path.join(directory, "manifest.json"),
)
const manifest = await Bun.file(manifestPath).json()
async function snapshot() {
  if (!process.env.METRICS_TOKEN) return { unavailable: "METRICS_TOKEN unset" }
  try {
    const response = await fetch(new URL("/api/metrics", base), {
      headers: { Authorization: `Bearer ${process.env.METRICS_TOKEN}` },
      signal: AbortSignal.timeout(15000),
    })
    return response.ok ? await response.json() : { unavailable: `HTTP ${response.status}` }
  } catch {
    return { unavailable: "Metrics request failed" }
  }
}
const before = await snapshot()
const startedAt = new Date().toISOString()
const summaryPath = path.join(directory, "summary.json")
await rm(summaryPath, { force: true })
const processHandle = Bun.spawn(["k6", "run", path.join(import.meta.dir, "reads.js")], {
  env: { ...process.env, LOAD_MANIFEST: manifestPath, LOAD_SUMMARY: summaryPath },
  stdout: "pipe",
  stderr: "pipe",
})
const [stdout, stderr, exitCode] = await Promise.all([
  new Response(processHandle.stdout).text(),
  new Response(processHandle.stderr).text(),
  processHandle.exited,
])
await Bun.write(path.join(directory, "k6.log"), stdout + stderr)
const after = await snapshot()
await Bun.write(path.join(directory, "telemetry.json"), JSON.stringify({ before, after }, null, 2))
if (!(await Bun.file(summaryPath).exists()))
  throw new Error(
    `k6 produced no summary (exit ${exitCode}); see ${path.join(directory, "k6.log")}`,
  )
const summary = await Bun.file(summaryPath).json()
const metrics = summary.metrics
const rows = Object.entries(metrics)
  .filter(
    ([name]) =>
      name.startsWith("read_latency{") && name.includes("kind:") && name.includes("scenario:reads"),
  )
  .map(([name, metric]) => {
    const values = (metric as { values: Record<string, number> }).values
    return `| ${name.match(/kind:([^,}]+)/)?.[1]} | ${values["p(95)"]?.toFixed(1)} | ${values["p(99)"]?.toFixed(1)} | ${values.max?.toFixed(1)} |`
  })
const duration = metrics["read_latency{scenario:reads}"]?.values
const failures = metrics["read_failed{scenario:reads}"]?.values
const correct = metrics["read_correct{scenario:reads}"]?.values
const measured = metrics["read_requests{scenario:reads}"]?.values
const seeks = metrics["cursor_seeks{scenario:reads}"]?.values
await Bun.write(
  path.join(directory, "report.md"),
  `# Read-load baseline\n\nStarted: ${startedAt}\n\nTarget: ${origin.origin}; ${manifest.count} pastes across ${manifest.ownerCount} accounts; large account ${manifest.whaleCount} pastes.\n\nGenerator: ${new TextDecoder().decode(version.stdout).trim()}. Host: ${os.platform()} ${os.arch()}, ${os.cpus().length} logical CPUs, ${(os.totalmem() / 2 ** 30).toFixed(1)} GiB RAM. App/database resources must be recorded separately.\n\nConfigured rate: ${process.env.LOAD_RATE ?? 20} read iterations/sec, duration ${process.env.LOAD_DURATION ?? "60s"}, following 15s warmup. Each iteration sends one measured read; setup/metrics are additional requests. Exit code: ${exitCode}.\n\nMeasured reads: ${measured?.count ?? "unknown"}; k6 summary counter rate: ${measured?.rate?.toFixed(2) ?? "unknown"}/sec (includes warmup/setup time; divide measured count by configured duration for the measured arrival rate).\n\nOverall measured p95: ${duration?.["p(95)"]?.toFixed(1)} ms; p99: ${duration?.["p(99)"]?.toFixed(1)} ms; unexpected HTTP failure rate: ${failures?.rate}. Correctness assertion failures: ${correct?.fails ?? 0}. Cursor seeks: ${seeks?.count ?? 0}.\n\n| Request kind | p95 ms | p99 ms | maximum ms |\n| --- | --- | --- | --- |\n${rows.join("\n")}\n\nRaw metrics and threshold outcomes: summary.json. Before/after server snapshots: telemetry.json. Generator output: k6.log.\n\nThis is an HTTP read baseline, not a browser or production capacity claim. Synthetic repeated file content compresses well in PostgreSQL. Authentication occurs once before load. All generators, app processes and database sharing a host compete for its resources. Warmup touches sampled routes but does not make every request a cache hit. Startup cleanup must finish before measurement. Writes, burn claims, simultaneous cleanup, deployments, and browser RSC navigation are not exercised.\n`,
)
console.info(`Report: ${path.join(directory, "report.md")} (k6 exit ${exitCode})`)
process.exitCode = exitCode
