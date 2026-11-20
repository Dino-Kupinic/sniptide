import assert from "node:assert/strict"
import test from "node:test"
import { providers, runRounds, summarize } from "./paste-benchmark.mjs"

test("attempts all eight services once per round and rotates the starting provider", async () => {
  assert.deepEqual(
    providers.map((p) => p.name),
    [
      "Sniptide",
      "PrivateBin",
      "Opengist",
      "MicroBin",
      "GitHub Gist",
      "Pastebin",
      "Hastebin",
      "Pastes.io",
    ],
  )
  const order = []
  const rows = await runRounds(providers, 2, async (provider) => {
    order.push(provider.name)
    return { outcome: "ok", ms: 10 }
  })
  assert.deepEqual(order.slice(8), [...order.slice(1, 8), order[0]])
  assert.ok(rows.every((row) => row.samples.length === 2))
})

test("reports observed failures separately from successful timings", () => {
  assert.deepEqual(
    summarize([{ outcome: "ok", ms: 6 }, { outcome: "HTTP 403" }, { outcome: "ok", ms: 2 }]),
    { success: 2, median: 4, failures: "1x HTTP 403" },
  )
  assert.equal(summarize([{ outcome: "timeout" }]).median, null)
})
