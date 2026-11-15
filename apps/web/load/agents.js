import crypto from "k6/crypto"
import exec from "k6/execution"
import http from "k6/http"
import { Rate, Trend } from "k6/metrics"

// One kind of agent request per run, sent by a fixed number of clients as fast as the server
// answers. agents.ts runs this once for each scenario and concurrency.
const origin = (__ENV.LOAD_BASE_URL || "http://127.0.0.1:3100").replace(/\/$/, "")
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) && __ENV.LOAD_ALLOW_REMOTE !== "1")
  throw new Error("Remote targets require LOAD_ALLOW_REMOTE=1 and an isolated staging instance")
if (!__ENV.LOAD_PASSWORD) throw new Error("Set LOAD_PASSWORD to the fixture account password")
const manifest = JSON.parse(open(__ENV.LOAD_MANIFEST || "./artifacts/manifest.json"))
if (!manifest.writerCount)
  throw new Error("The manifest has no API tokens; seed the database again")
const scenario = __ENV.LOAD_SCENARIO
const latency = new Trend("agent_latency", true)
const failed = new Rate("agent_failed")
export const options = {
  scenarios: {
    agents: {
      executor: "constant-vus",
      vus: Number(__ENV.LOAD_CLIENTS || 1),
      duration: __ENV.LOAD_DURATION || "15s",
    },
  },
  summaryTrendStats: ["avg", "min", "med", "max", "p(95)", "p(99)"],
  systemTags: ["status", "scenario"],
}

const pad = (value, width) => String(value).padStart(width, "0")
// seed.ts stores the hash of the same value.
const tokens = {}
function token(kind, index) {
  const key = `${kind}:${index}`
  tokens[key] ??= `snpt_${crypto.sha256(`${__ENV.LOAD_PASSWORD}:${key}`, "base64rawurl")}`
  return tokens[key]
}
const whale = (n) => token("whale", n % manifest.whaleTokenCount)
const writer = (n) => token("writer", n % manifest.writerCount)
// A live paste of the large account. Of every 50 fixtures, the last two are trashed or expired.
function liveSlug(n) {
  let index = (n * 7919) % manifest.whaleCount
  if (index % 50 >= 48) index -= 2
  return `load-${pad(index, 7)}`
}
const publicSlug = (n) => manifest.publicPastes[n % manifest.publicPastes.length]
const line = 'export const value = "0123456789abcdef0123456789abcdef";\n'
const code = line.repeat(
  Math.max(1, Math.round(Number(__ENV.LOAD_CREATE_BYTES || 2000) / line.length)),
)
const capture = (n) => ({
  title: `Load capture ${n}`,
  files: [{ name: `src/load-${n}.ts`, content: `// load capture ${n} at ${Date.now()}\n${code}` }],
  tags: ["load"],
})
// Words in the code of every fixture, of one fixture, and of none, plus a word only in titles.
const words = { common: "export", rare: "item4242", none: "zzqqxxnomatch", title: "fixture 00042" }
const bearer = (value) => ({ authorization: `Bearer ${value}` })
const get = (value, path) => http.get(origin + path, { headers: bearer(value) })
const search = (n, word) => get(whale(n), `/api/v1/pastes?q=${encodeURIComponent(word)}`)
const rpc = (value, body) =>
  http.post(`${origin}/api/mcp`, JSON.stringify({ jsonrpc: "2.0", id: 1, ...body }), {
    headers: {
      ...bearer(value),
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
  })
const tool = (value, name, args) =>
  rpc(value, { method: "tools/call", params: { name, arguments: args } })
const requests = {
  api_read: (n) => get(whale(n), `/api/v1/pastes/${liveSlug(n)}`),
  api_list: (n) => get(whale(n), "/api/v1/pastes?limit=20"),
  api_search_common: (n) => search(n, words.common),
  api_search_title: (n) => search(n, words.title),
  api_search_rare: (n) => search(n, words.rare),
  api_search_none: (n) => search(n, words.none),
  api_create: (n) =>
    http.post(`${origin}/api/v1/pastes`, JSON.stringify(capture(n)), {
      headers: { ...bearer(writer(n)), "content-type": "application/json" },
    }),
  mcp_tools_list: (n) => rpc(whale(n), { method: "tools/list" }),
  mcp_read: (n) => tool(whale(n), "read_snippet", { id: liveSlug(n) }),
  mcp_search_common: (n) => tool(whale(n), "search_snippets", { query: words.common }),
  mcp_create: (n) => tool(writer(n), "create_snippet", capture(n)),
  shared_page: (n) => http.get(`${origin}/${publicSlug(n)}`),
  shared_raw: (n) => http.get(`${origin}/${publicSlug(n)}/raw?file=snippet.ts`),
}
if (!requests[scenario])
  throw new Error(`LOAD_SCENARIO must be one of: ${Object.keys(requests).join(", ")}`)

export default function () {
  const response = requests[scenario](exec.scenario.iterationInTest)
  const ok =
    (response.status === 200 || response.status === 201) &&
    !(scenario.startsWith("mcp_") && String(response.body).includes('"isError":true'))
  latency.add(response.timings.duration)
  failed.add(!ok)
}
export function handleSummary(data) {
  return { [__ENV.LOAD_SUMMARY]: JSON.stringify(data) }
}
