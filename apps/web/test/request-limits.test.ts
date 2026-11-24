import { expect, test } from "bun:test"
import { PASTE_REQUEST_BYTES } from "@/lib/request-body"
import nextConfig from "@/next.config"

const MB = 1024 * 1024

test("Server Actions accept the same body size as the REST API", () => {
  expect(nextConfig.experimental?.serverActions?.bodySizeLimit).toBe(PASTE_REQUEST_BYTES)
})

test("a paste at the default 1 MB limit fits once it is encoded for a Server Action", () => {
  // Quotes and newlines double in JSON, which is the worst case for ordinary code.
  const content = '"\n'.repeat(MB / 2)
  const body = JSON.stringify([{ title: "Fixture", files: [{ name: "data.json", content }] }])
  expect(new TextEncoder().encode(body).byteLength).toBeGreaterThan(MB)
  expect(new TextEncoder().encode(body).byteLength).toBeLessThan(PASTE_REQUEST_BYTES)
})
