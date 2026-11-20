import { createHash, randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { parseArgs } from "node:util"
import { chromium } from "playwright-core"

export const providers = [
  {
    name: "Sniptide",
    url: "https://app.sniptide.com/new",
    editor: 'textarea[aria-label^="Contents of"]',
    submit: /^Create paste/,
  },
  { name: "PrivateBin", url: "https://privatebin.net/", editor: "#message", button: "#sendbutton" },
  {
    name: "Opengist",
    url: "https://demo.opengist.io/",
    editor: ".cm-content",
    submit: /^Create .*gist/i,
  },
  {
    name: "MicroBin",
    url: "https://pub.microbin.eu/",
    editor: "#content-input",
    button: "#submit-button",
  },
  {
    name: "GitHub Gist",
    url: "https://gist.github.com/",
    editor: ".cm-content, .CodeMirror textarea, .monaco-editor textarea",
    submit: /^Create secret gist/i,
  },
  {
    name: "Pastebin",
    url: "https://pastebin.com/",
    editor: "#postform-text",
    submit: /^Create New Paste/i,
  },
  { name: "Hastebin", url: "https://www.toptal.com/developers/hastebin", editor: "textarea" },
  {
    name: "Pastes.io",
    url: "https://pastes.io/",
    editor: ".cm-content",
    submit: /^Create New Paste/i,
  },
]
const timeout = 15000

function payload(roundId, bytes) {
  const prefix = `// health-check ${roundId} `
  const blocks = [prefix]
  for (let index = 0; prefix.length + 64 * index < bytes; index++) {
    blocks.push(
      createHash("sha256")
        .update(roundId + String(index))
        .digest("hex"),
    )
  }
  return blocks.join("").slice(0, bytes)
}

export async function runRounds(targets, rounds, measure, bytes = 1024, pauseMs = 0) {
  const rows = targets.map(({ name }) => ({ name, samples: [] }))
  for (let round = 0; round < rounds; round++) {
    if (pauseMs) await new Promise((resolve) => setTimeout(resolve, pauseMs))
    const text = payload(randomUUID(), bytes)
    for (let step = 0; step < targets.length; step++) {
      const index = (round + step) % targets.length
      rows[index].samples.push(await measure(targets[index], text))
    }
  }
  return rows
}

export function summarize(samples) {
  const completed = samples.filter((s) => s.outcome === "verified")
  const median = (key) => {
    const times = completed.map((s) => s[key]).sort((a, b) => a - b)
    return times.length
      ? (times[Math.floor(times.length / 2)] + times[Math.floor((times.length - 1) / 2)]) / 2
      : null
  }
  return {
    completed: completed.length,
    createMs: median("createMs"),
    readMs: median("readMs"),
    totalMs: median("totalMs"),
  }
}

async function open(page, url) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout })
  if (!response?.ok()) throw new Error(`HTTP ${response?.status() ?? "unknown"}`)
  if (new URL(page.url()).host !== new URL(url).host) throw new Error("redirected to another host")
}

async function prepare(page, provider, text) {
  await open(page, provider.url)
  const pathname = new URL(page.url()).pathname
  if (["/sign-in", "/-/all", "/starred", "/login"].includes(pathname))
    throw new Error("writer sign-in required")
  if (provider.name === "Pastebin") {
    const consent = page.getByRole("button", { name: "AGREE", exact: true })
    await page.addLocatorHandler(consent, () => consent.click())
    const visibility = page.locator("#postform-status")
    if (await visibility.count()) await visibility.selectOption("1", { force: true })
  }
  if (provider.name === "Sniptide") {
    await page.getByLabel("Title", { exact: true }).fill("Paste benchmark")
    await page.getByRole("radio", { name: "Unlisted", exact: true }).check()
  }
  const editor = page.locator(provider.editor).filter({ visible: true }).first()
  await editor.click()
  await page.keyboard.insertText(text)
}

async function publish(page, provider) {
  const entry = page.url()
  if (provider.name === "Hastebin") await page.keyboard.press("Control+s")
  else {
    const button = provider.button
      ? page.locator(provider.button)
      : page.getByRole("button", { name: provider.submit })
    await button.first().click()
  }
  await page.waitForURL((url) => url.href !== entry, { waitUntil: "commit", timeout })
  const link = new URL(page.url())
  if (provider.name === "Sniptide") {
    const match = /^\/pastes\/([^/]+)$/.exec(link.pathname)
    if (!match) throw new Error("share link missing")
    link.pathname = `/${match[1]}`
    if (provider.readerOrigin) return new URL(link.pathname, provider.readerOrigin).href
  }
  return link.href
}

async function roundTrip(browser, provider, text) {
  let writer
  let reader
  let stage = "writer session"
  try {
    writer = await browser.newContext({ storageState: provider.storageState })
    reader = await browser.newContext()
    stage = "prepare"
    const page = await writer.newPage()
    const recipient = await reader.newPage()
    page.setDefaultTimeout(timeout)
    await prepare(page, provider, text)
    stage = "publish"
    const start = performance.now()
    const link = await publish(page, provider)
    const shared = performance.now()
    stage = "read"
    await open(recipient, link)
    const content = recipient.getByText(text, { exact: true }).filter({ visible: true }).first()
    await content.waitFor({ timeout })
    // Opengist renders an extra newline in each table cell. Its copy source contains the saved file.
    const recovered =
      provider.name === "Opengist"
        ? await recipient.locator('textarea[aria-hidden="true"]').first().inputValue({ timeout })
        : await content.textContent()
    if (recovered !== text) throw new Error("content mismatch")
    const end = performance.now()
    return {
      outcome: "verified",
      createMs: Math.round(shared - start),
      readMs: Math.round(end - shared),
      totalMs: Math.round(end - start),
    }
  } catch (error) {
    const reason = error.name === "TimeoutError" ? "timeout" : error.message.split("\n")[0]
    // Browser error messages can include a private share URL or its decryption fragment.
    const known =
      /^(HTTP [0-9]+|timeout|content mismatch|writer sign-in required|redirected to another host|share link missing)$/
    return { outcome: `${stage}: ${known.test(reason) ? reason : "browser error"}` }
  } finally {
    await Promise.all([writer?.close(), reader?.close()])
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      config: { type: "string" },
      hosted: { type: "boolean" },
      rounds: { type: "string", default: "3" },
      bytes: { type: "string", default: "1024" },
      json: { type: "boolean" },
      help: { type: "boolean" },
    },
  })
  if (values.help || (!values.hosted && !values.config)) {
    console.log(
      "bun run benchmark (--config instances.json | --hosted) [--rounds 1..20] [--bytes 128..65536] [--json]\nEach attempt publishes a new disposable paste and opens its share link in a fresh reader session. Configure disposable instances or accounts before running.",
    )
    if (!values.help) process.exitCode = 2
    return
  }
  if (values.hosted && values.config) throw new Error("Choose either --hosted or --config")
  const rounds = Number(values.rounds)
  const bytes = Number(values.bytes)
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 20)
    throw new Error("Expected 1 to 20 rounds")
  if (!Number.isInteger(bytes) || bytes < 128 || bytes > 65536)
    throw new Error("Expected 128 to 65536 bytes")
  const config = values.config
    ? JSON.parse(await readFile(values.config, "utf8"))
    : Object.fromEntries(providers.map((p) => [p.name, {}]))
  if (!config || Array.isArray(config) || typeof config !== "object" || !Object.keys(config).length)
    throw new Error("Expected at least one provider")
  for (const [name, options] of Object.entries(config)) {
    if (
      !providers.some((p) => p.name === name) ||
      !options ||
      typeof options !== "object" ||
      Array.isArray(options)
    )
      throw new Error("Invalid provider configuration")
    for (const key of Object.keys(options))
      if (
        !["url", "storageState", "readerOrigin"].includes(key) ||
        typeof options[key] !== "string"
      )
        throw new Error(`Invalid option for ${name}`)
  }
  const targets = providers
    .filter((p) => Object.hasOwn(config, p.name))
    .map((p) => ({ ...p, ...config[p.name] }))
  const browser = await chromium.launch({ channel: "chrome" })
  try {
    const started = new Date().toISOString()
    const rows = await runRounds(
      targets,
      rounds,
      (p, text) => roundTrip(browser, p, text),
      bytes,
      11000,
    )
    const result = {
      started,
      browser: browser.version(),
      platform: process.platform,
      rounds,
      bytes,
      roundPauseMs: 11000,
      unmeasured: providers.filter((p) => !Object.hasOwn(config, p.name)).map((p) => p.name),
      instances: targets.map((p) => ({ name: p.name, origin: new URL(p.url).origin })),
      rows,
    }
    if (values.json) console.log(JSON.stringify(result, null, 2))
    else {
      console.log(started, "| Chrome", result.browser, "|", bytes, "bytes per paste")
      if (result.unmeasured.length) console.log("Outside this run:", result.unmeasured.join(", "))
      console.table(
        rows.map(({ name, samples }) => {
          const { completed, createMs, readMs, totalMs } = summarize(samples)
          return {
            Service: name,
            Verified: `${completed}/${rounds}`,
            "Publish ms": createMs ?? "-",
            "Read ms": readMs ?? "-",
            "Round trip ms": totalMs ?? "-",
            Failures: [
              ...new Set(samples.filter((s) => s.outcome !== "verified").map((s) => s.outcome)),
            ].join(", "),
          }
        }),
      )
    }
  } finally {
    await browser.close()
  }
}
if (import.meta.main) await main()
