import { readFile } from "node:fs/promises"
import { parseArgs } from "node:util"
import { chromium } from "playwright-core"

export const providers = [
  { name: "Sniptide", url: "https://app.sniptide.com/new", editor: ".cm-content, textarea" },
  { name: "PrivateBin", url: "https://privatebin.net/", editor: "#message" },
  {
    name: "Opengist",
    url: "https://demo.opengist.io/",
    editor: ".cm-content, textarea[name=content]",
  },
  { name: "MicroBin", url: "https://pub.microbin.eu/", editor: "textarea[name=content]" },
  {
    name: "GitHub Gist",
    url: "https://gist.github.com/",
    editor: ".cm-content, .CodeMirror textarea",
  },
  { name: "Pastebin", url: "https://pastebin.com/", editor: "#postform-text" },
  { name: "Hastebin", url: "https://www.toptal.com/developers/hastebin", editor: "textarea" },
  { name: "Pastes.io", url: "https://pastes.io/", editor: ".cm-content" },
]
const snippet = 'export const health = () => ({ status: "ok" })'
const timeout = 15000

export async function runRounds(targets, rounds, measure) {
  const rows = targets.map(({ name }) => ({ name, samples: [] }))
  for (let round = 0; round < rounds; round++) {
    for (let step = 0; step < targets.length; step++) {
      const index = (round + step) % targets.length
      rows[index].samples.push(await measure(targets[index]))
    }
  }
  return rows
}

function median(times) {
  if (!times.length) return null
  const sorted = [...times].sort((a, b) => a - b)
  return (sorted[Math.floor(sorted.length / 2)] + sorted[Math.floor((sorted.length - 1) / 2)]) / 2
}

export function summarize(samples) {
  const times = samples.filter((s) => s.outcome === "ok").map((s) => s.ms)
  const failures = new Map()
  for (const { outcome } of samples) {
    if (outcome !== "ok") failures.set(outcome, (failures.get(outcome) ?? 0) + 1)
  }
  return {
    success: times.length,
    median: median(times),
    failures: Array.from(failures, ([reason, count]) => `${count}x ${reason}`).join(", "),
  }
}

async function measure(browser, target, fixtures) {
  const url = fixtures ? fixtures[target.name] : target.url
  if (!url) return { outcome: "missing fixture" }
  const page = await browser.newPage()
  if (target.name === "Pastebin") {
    const consent = page.getByRole("button", { name: "AGREE", exact: true })
    await page.addLocatorHandler(consent, () => consent.click({ timeout: 2000 }))
  }
  const start = performance.now()
  const remaining = () => Math.max(1, timeout - (performance.now() - start))
  let stage = "navigation"
  let pageMs
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout })
    if (!response?.ok()) return { outcome: `HTTP ${response?.status() ?? "unknown"}` }
    const location = new URL(page.url())
    if (location.host !== new URL(url).host) return { outcome: `redirect to ${location.host}` }
    pageMs = Math.round(performance.now() - start)
    if (fixtures) {
      stage = "visible snippet"
      await page
        .getByText(snippet, { exact: true })
        .filter({ visible: true })
        .first()
        .waitFor({ timeout: remaining() })
    } else {
      if (location.pathname === "/sign-in") return { outcome: "sign-in", pageMs }
      if (["/-/all", "/starred"].includes(location.pathname))
        return { outcome: "gist directory", pageMs }
      stage = "editor input"
      const editor = page.locator(target.editor).filter({ visible: true }).first()
      await editor.click({ timeout: remaining() })
      await page.keyboard.insertText(snippet)
      stage = "editor verification"
      const value = await editor.evaluate((el) => el.value ?? el.textContent, undefined, {
        timeout: remaining(),
      })
      if (value !== snippet) return { outcome: "text mismatch", pageMs }
    }
    const ms = performance.now() - start
    return ms > timeout
      ? { outcome: `${stage} timeout`, pageMs }
      : { outcome: "ok", pageMs, ms: Math.round(ms) }
  } catch (error) {
    return {
      pageMs,
      outcome:
        error.name === "TimeoutError"
          ? `${stage} timeout`
          : (error.message.match(/net::ERR_\w+/)?.[0] ?? `${stage} failed`),
    }
  } finally {
    await page.close()
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      rounds: { type: "string", default: "3" },
      fixtures: { type: "string" },
      json: { type: "boolean" },
      help: { type: "boolean" },
    },
  })
  if (values.help) {
    console.log(
      "bun run benchmark [--rounds 1..20] [--fixtures urls.json] [--json]\nDefault: enter a snippet in each signed-out editor. With fixtures: open each share link and verify the visible text.\nFixture text: " +
        snippet,
    )
    return
  }
  const rounds = Number(values.rounds)
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 20)
    throw new Error("--rounds must be an integer from 1 to 20")
  const fixtures =
    values.fixtures === undefined ? undefined : JSON.parse(await readFile(values.fixtures, "utf8"))
  if (values.fixtures !== undefined) {
    if (!fixtures || typeof fixtures !== "object" || Array.isArray(fixtures))
      throw new Error("Expected a JSON object mapping service names to share URLs")
    for (const [name, url] of Object.entries(fixtures)) {
      if (
        !providers.some((p) => p.name === name) ||
        typeof url !== "string" ||
        !["https:", "http:"].includes(new URL(url).protocol)
      )
        throw new Error(`Invalid fixture for ${name}`)
    }
  }
  const browser = await chromium.launch({ channel: "chrome" })
  try {
    const metadata = {
      started: new Date().toISOString(),
      browser: browser.version(),
      platform: process.platform,
      workload: fixtures ? "shared paste visible" : "signed-out editor input",
      rounds,
      timeoutMs: timeout,
    }
    const rows = await runRounds(providers, rounds, (target) => measure(browser, target, fixtures))
    if (values.json) console.log(JSON.stringify({ ...metadata, rows }, null, 2))
    else {
      console.log(
        metadata.started,
        "| Chrome",
        metadata.browser,
        "|",
        metadata.platform,
        "|",
        metadata.workload,
      )
      console.table(
        rows.map(({ name, samples }) => {
          const { success, median: taskMedian, failures } = summarize(samples)
          return {
            Service: name,
            Completed: `${success}/${rounds}`,
            "Page median ms":
              median(samples.flatMap((s) => (s.pageMs === undefined ? [] : [s.pageMs]))) ?? "-",
            "Task median ms": taskMedian ?? "-",
            "Other outcomes": failures,
          }
        }),
      )
    }
  } finally {
    await browser.close()
  }
}

if (import.meta.main) await main()
