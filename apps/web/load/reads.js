import { check } from "k6"
import exec from "k6/execution"
import http from "k6/http"
import { Counter, Rate, Trend } from "k6/metrics"

const origin = (__ENV.LOAD_BASE_URL || "http://127.0.0.1:3100").replace(/\/$/, "")
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) && __ENV.LOAD_ALLOW_REMOTE !== "1")
  throw new Error("Remote targets require LOAD_ALLOW_REMOTE=1 and an isolated staging instance")
const manifest = JSON.parse(open(__ENV.LOAD_MANIFEST || "./artifacts/manifest.json"))
const duration = __ENV.LOAD_DURATION || "60s"
if (!/^[1-9]\d*(s|m)$/.test(duration))
  throw new Error("LOAD_DURATION must use seconds or minutes, e.g. 60s")
const seconds = Number(duration.slice(0, -1)) * (duration.endsWith("m") ? 60 : 1)
if (seconds < 5 || seconds > 1800) throw new Error("LOAD_DURATION must be 5 seconds to 30 minutes")
const rate = Number(__ENV.LOAD_RATE || 20)
if (!Number.isInteger(rate) || rate < 1 || rate > 1000) throw new Error("Invalid LOAD_RATE")
const requests = new Counter("read_requests")
const cursorSeeks = new Counter("cursor_seeks")
const latency = new Trend("read_latency", true)
const failed = new Rate("read_failed")
const correctness = new Rate("read_correct")
const kinds = [
  "shared",
  "shared",
  "hot",
  "raw",
  "list",
  "search",
  "cursor",
  "collection",
  "dashboard",
  "deep",
]
const thresholds = {
  "read_requests{scenario:reads}": ["count>0"],
  "cursor_seeks{scenario:reads}": ["count>0"],
  "read_latency{scenario:reads}": [
    `p(95)<${__ENV.LOAD_P95_MS || 500}`,
    `p(99)<${__ENV.LOAD_P99_MS || 1000}`,
  ],
  "read_failed{scenario:reads}": ["rate<0.005"],
  "read_correct{scenario:reads}": ["rate==1"],
  "dropped_iterations{scenario:reads}": ["count==0"],
}
for (const kind of kinds)
  thresholds[`read_latency{kind:${kind},scenario:reads}`] = [`p(95)<${__ENV.LOAD_P95_MS || 500}`]
export const options = {
  scenarios: {
    warmup: {
      executor: "constant-arrival-rate",
      rate: 5,
      timeUnit: "1s",
      duration: "15s",
      preAllocatedVUs: 10,
      exec: "read",
    },
    reads: {
      executor: "constant-arrival-rate",
      rate,
      timeUnit: "1s",
      duration,
      startTime: "16s",
      preAllocatedVUs: Math.max(20, rate * 2),
      maxVUs: Math.max(40, rate * 4),
      exec: "read",
    },
  },
  thresholds,
  summaryTrendStats: ["avg", "min", "med", "max", "p(95)", "p(99)"],
  systemTags: ["status", "method", "name", "scenario", "expected_response"],
}
export function setup() {
  if (!__ENV.LOAD_PASSWORD) throw new Error("Set LOAD_PASSWORD to the fixture account password")
  const response = http.post(
    `${origin}/api/auth/sign-in/email`,
    JSON.stringify({ email: manifest.email, password: __ENV.LOAD_PASSWORD }),
    {
      headers: { "Content-Type": "application/json", Origin: origin },
      redirects: 0,
      tags: { name: "setup:login" },
    },
  )
  if (response.status !== 200) throw new Error(`Fixture login failed (${response.status})`)
  const cookie = Object.entries(response.cookies)
    .flatMap(([name, cookies]) => cookies.map((item) => `${name}=${item.value}`))
    .join("; ")
  const session = http.get(`${origin}/api/auth/get-session`, {
    headers: { Cookie: cookie },
    tags: { name: "setup:session" },
  })
  if (session.status !== 200 || session.json("user.email") !== manifest.email)
    throw new Error("Fixture session was not established")
  return { cookie }
}
let cursor
let cursorPage = 1
export function read(data) {
  const iteration = exec.scenario.iterationInTest
  const kind = kinds[iteration % kinds.length]
  const slug =
    kind === "hot"
      ? manifest.hotPaste
      : manifest.publicPastes[Math.floor(iteration / kinds.length) % manifest.publicPastes.length]
  let path = `/${slug}`
  let expected = `Load fixture ${slug.slice(5)}`
  let authenticated = false
  if (kind === "raw") {
    path += "/raw?file=snippet.ts"
    expected = `load-fixture:${slug}`
  } else if (["list", "search", "cursor", "deep"].includes(kind)) {
    authenticated = true
    path = "/pastes"
    expected = "Load fixture"
    if (kind === "search") path += Math.floor(iteration / kinds.length) % 2 ? "?q=fixture" : "?q=0"
    if (kind === "deep") path += `?page=${Math.max(2, Math.floor(manifest.whaleCount / 20))}`
    if (kind === "cursor" && cursor) path += `?page=${cursorPage}&cursor=${cursor}`
  } else if (kind === "collection") {
    authenticated = true
    path = `/collections/${manifest.collection}`
    expected = "Load notes"
  } else if (kind === "dashboard") {
    authenticated = true
    path = "/dashboard"
    expected = "Load fixture"
  }
  // Explicitly clear cookies on public requests: setup's cookie jar must not widen authorization.
  http.cookieJar().clear(origin)
  const response = http.get(origin + path, {
    headers: authenticated ? { Cookie: data.cookie } : {},
    redirects: 0,
    timeout: "15s",
    tags: { name: `read:${kind}`, kind },
  })
  const ok =
    response.status === 200 && typeof response.body === "string" && response.body.includes(expected)
  requests.add(1, { kind })
  if (kind === "cursor" && cursor) cursorSeeks.add(1)
  latency.add(response.timings.duration, { kind })
  failed.add(response.status !== 200, { kind })
  correctness.add(ok, { kind })
  check(response, { "expected status and fixture content": () => ok }, { kind })
  if (kind === "cursor") {
    const match =
      typeof response.body === "string" &&
      response.body.match(/nextCursor\\?":\\?"([A-Za-z0-9_-]+)/)
    if (!match) {
      correctness.add(false, { kind })
      cursor = undefined
      cursorPage = 1
    } else {
      cursor = match[1]
      cursorPage++
      if (cursorPage > 10) {
        cursor = undefined
        cursorPage = 1
      }
    }
  }
}
export function handleSummary(data) {
  return { [__ENV.LOAD_SUMMARY || "./artifacts/summary.json"]: JSON.stringify(data, null, 2) }
}
