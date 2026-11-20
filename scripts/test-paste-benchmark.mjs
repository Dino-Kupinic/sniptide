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
  const fixtures = []
  const rows = await runRounds(providers, 2, async (provider, text) => {
    fixtures.push(text)
    order.push(provider.name)
    return { outcome: "verified", createMs: 5, readMs: 5, totalMs: 10 }
  })
  assert.equal(Buffer.byteLength(fixtures[0]), 1024)
  assert.equal(new Set(fixtures.slice(0, 8)).size, 1)
  assert.equal(new Set(fixtures.slice(8)).size, 1)
  assert.notEqual(fixtures[0], fixtures[8])
  assert.deepEqual(order.slice(8), [...order.slice(1, 8), order[0]])
  assert.ok(rows.every((row) => row.samples.length === 2))
})

test("only verified round trips enter latency medians", () => {
  const samples = [
    { outcome: "verified", createMs: 1, readMs: 9, totalMs: 10 },
    { outcome: "read: content mismatch" },
    { outcome: "verified", createMs: 3, readMs: 5, totalMs: 8 },
    { outcome: "verified", createMs: 8, readMs: 4, totalMs: 12 },
  ]
  assert.deepEqual(summarize(samples), { completed: 3, createMs: 3, readMs: 5, totalMs: 10 })
  assert.equal(summarize(samples.slice(0, 3)).totalMs, 9)
  assert.equal(summarize([{ outcome: "publish: timeout" }]).totalMs, null)
})
