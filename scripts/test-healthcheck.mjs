import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const { healthy } = createRequire(import.meta.url)("./healthcheck.cjs")

test("the container health check accepts only successful health responses", async () => {
  assert.equal(
    await healthy(async (url) => {
      assert.equal(url, "http://127.0.0.1:3000/api/health")
      return { ok: true }
    }),
    true,
  )
  assert.equal(await healthy(async () => ({ ok: false })), false)
  assert.equal(
    await healthy(async () => {
      throw new Error("unreachable")
    }),
    false,
  )
})
