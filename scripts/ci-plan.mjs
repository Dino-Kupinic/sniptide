import { execFileSync } from "node:child_process"
import { appendFileSync, globSync, readFileSync } from "node:fs"
import { join } from "node:path"

const targets = ["cli", "container", "extension", "raycast", "sdk", "shared", "vscode", "web"]

// These paths have known consumers. Shared code, config and new paths use the full matrix.
const isolated = [
  ["apps/admin/", ["web"]],
  ["apps/docs/content/docs/", []],
  ["apps/extension/", ["extension"]],
  ["apps/vscode/", ["vscode"]],
  ["apps/web/test/", ["web"]],
  ["packages/cli/", ["cli", "web"]],
  ["packages/oauth-client/", ["extension", "vscode"]],
  ["packages/sdk/", ["sdk"]],
  ["packages/sdk-python/", ["sdk"]],
  ["plugins/raycast/", ["raycast"]],
]

const webSource = /^apps\/web\/(app|assets|components|emails|hooks|i18n|lib|messages|public)\//

export function selectTests(paths, allSpecs) {
  const full = Object.fromEntries(targets.map((target) => [target, true]))
  if (!paths?.length) return { ...full, browser: allSpecs }

  const selected = Object.fromEntries(targets.map((target) => [target, false]))
  const browser = new Set()
  for (const path of paths) {
    if (path.startsWith("apps/web/tests/") || path === "apps/web/e2e.config.ts") {
      const spec = path.slice("apps/web/".length)
      for (const file of allSpecs.includes(spec) ? [spec] : allSpecs) browser.add(file)
      continue
    }
    if (webSource.test(path)) {
      selected.web = true
      selected.container = true
      for (const file of allSpecs) browser.add(file)
      continue
    }
    const entry = isolated.find(([prefix]) => path.startsWith(prefix))
    if (!entry) return { ...full, browser: allSpecs }
    for (const target of entry[1]) selected[target] = true
  }
  return { ...selected, browser: [...browser] }
}

export function testDurations(reports) {
  const durations = new Map()
  for (const report of reports) {
    if (!Array.isArray(report?.run?.results)) continue
    for (const result of report.run.results) {
      if (
        !result?.selected ||
        result.status !== "passed" ||
        typeof result.file !== "string" ||
        !Array.isArray(result.attempts)
      ) {
        continue
      }
      for (const attempt of result.attempts) {
        if (
          attempt?.status === "passed" &&
          Number.isFinite(attempt.durationMs) &&
          attempt.durationMs > 0
        ) {
          durations.set(result.file, (durations.get(result.file) ?? 0) + attempt.durationMs)
        }
      }
    }
  }
  return durations
}

export function buildShards(files, durations) {
  const recorded = files
    .map((file) => durations.get(file))
    .filter((duration) => duration !== undefined)
    .sort((a, b) => a - b)
  const fallback = recorded[Math.floor(recorded.length / 2)] ?? 1
  const size = (file) => durations.get(file) ?? fallback
  const shards = Array.from({ length: Math.min(2, files.length) }, (_, shard) => ({
    shard,
    files: [],
    load: 0,
  }))

  const longestFirst = [...files].sort((a, b) => size(b) - size(a) || a.localeCompare(b))
  for (const file of longestFirst) {
    const lightest = shards.reduce((a, b) => (a.load <= b.load ? a : b))
    lightest.files.push(file)
    lightest.load += size(file)
  }
  return shards.map(({ shard, files }) => ({ shard, files }))
}

function changedPaths(base) {
  if (!/^[a-f0-9]{40}$/.test(base ?? "")) return null
  try {
    return execFileSync("git", ["diff", "--no-renames", "--name-only", "-z", base, "HEAD", "--"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
      .split("\0")
      .filter(Boolean)
  } catch {
    console.warn("Could not read the pull request diff. Running all test suites.")
    return null
  }
}

function browserHistory({ GH_TOKEN, GITHUB_REPOSITORY, RUNNER_TEMP }) {
  if (!GH_TOKEN || !GITHUB_REPOSITORY || !RUNNER_TEMP) return new Map()
  const gh = (args) =>
    execFileSync("gh", [...args, "--repo", GITHUB_REPOSITORY], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 8000,
    }).trim()

  try {
    const run = gh([
      "run",
      "list",
      "--workflow",
      "ci.yml",
      "--branch",
      "main",
      "--event",
      "push",
      "--status",
      "success",
      "--limit",
      "1",
      "--json",
      "databaseId",
      "--jq",
      ".[0].databaseId",
    ])
    if (!/^\d+$/.test(run)) return new Map()
    const directory = join(RUNNER_TEMP, "previous-browser-reports")
    gh(["run", "download", run, "--pattern", "e2e-results-*", "--dir", directory])
    const reports = globSync("e2e-results-*/report.json", { cwd: directory }).flatMap((file) => {
      try {
        return [JSON.parse(readFileSync(join(directory, file), "utf8"))]
      } catch {
        return []
      }
    })
    console.log("Read", reports.length, "browser timing reports from main run", run)
    return testDurations(reports)
  } catch {
    console.warn("Browser timings are unavailable. Shards will use equal weights.")
    return new Map()
  }
}

if (import.meta.main) {
  const specs = globSync("tests/**/*.e2e.ts", { cwd: "apps/web" }).sort()
  if (specs.length === 0) throw new Error("No browser specs found")
  const { browser, ...selection } = selectTests(changedPaths(process.env.CI_PR_BASE), specs)
  const durations = browser.length > 1 ? browserHistory(process.env) : new Map()
  const plan = { ...selection, shards: buildShards(browser, durations) }

  console.log(JSON.stringify(plan, null, 2))
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries(plan)
        .map(([name, value]) => `${name}=${JSON.stringify(value)}\n`)
        .join(""),
    )
  }
}
