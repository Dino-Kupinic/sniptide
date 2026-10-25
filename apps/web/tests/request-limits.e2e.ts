import { createHash, randomBytes } from "node:crypto"
import { request as httpRequest } from "node:http"
import { test as anonymousTest } from "@e2e-dev/web"
import { createDb } from "@workspace/db"
import { apiToken, user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { expect } from "e2e"
import { databaseUrl } from "./environment"
import { test } from "./fixtures"

async function sendChunks(url: URL, bytes: number, headers?: HeadersInit, method = "POST") {
  return new Promise<number>((resolve, reject) => {
    const request = httpRequest(
      url,
      { method, headers: Object.fromEntries(new Headers(headers)), agent: false },
      (response) => {
        response.resume()
        response.on("end", () => resolve(response.statusCode ?? 0))
        response.on("error", reject)
      },
    )
    request.on("error", reject)
    let sent = 0
    function write() {
      while (sent < bytes) {
        const chunk = Buffer.alloc(Math.min(bytes - sent, 64 * 1024), 32)
        sent += chunk.byteLength
        if (!request.write(chunk)) {
          request.once("drain", write)
          return
        }
      }
      request.end()
    }
    write()
  })
}

anonymousTest(
  "chunked auth, unlock and locale bodies stop at their limits on Next",
  async ({ app }) => {
    for (const [path, bytes] of [
      ["/api/auth/sign-in/email", 256 * 1024],
      ["/missing/unlock", 2048],
      ["/api/locale", 2048],
    ] as const) {
      expect(await sendChunks(new URL(path, app.baseUrl), bytes)).toBe(413)
    }
    const valid = await fetch(new URL("/api/locale", app.baseUrl), {
      method: "POST",
      body: JSON.stringify("de"),
      headers: { "content-type": "application/json" },
    })
    expect(valid.status).toBe(200)
  },
)

test("token API bounds chunked bodies and still creates and updates captures", async ({
  account,
  app,
}) => {
  const db = createDb(databaseUrl())
  try {
    const [owner] = await db.select().from(user).where(eq(user.email, account.email))
    if (!owner) throw new Error("missing test account")
    const token = `snpt_${randomBytes(32).toString("base64url")}`
    await db.insert(apiToken).values({
      ownerId: owner.id,
      name: "request-limit-test",
      prefix: token.slice(0, 11),
      hash: createHash("sha256").update(token).digest("hex"),
      scopes: ["read", "write"],
    })
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" }
    for (const [path, bytes, method] of [
      ["/api/v1/pastes", 9 * 1024 * 1024, "POST"],
      ["/api/v1/pastes/missing", 9 * 1024 * 1024, "PUT"],
      ["/api/v1/env/test", 2 * 1024 * 1024, "PUT"],
    ] as const) {
      expect(await sendChunks(new URL(path, app.baseUrl), bytes, headers, method)).toBe(413)
    }
    const body = JSON.stringify({
      title: "HTTP control",
      files: [{ name: "a.txt", content: "ok" }],
    })
    const created = await fetch(new URL("/api/v1/pastes", app.baseUrl), {
      method: "POST",
      headers,
      body,
    })
    expect(created.status).toBe(201)
    const { paste } = (await created.json()) as { paste: { id: string } }
    const updated = await fetch(new URL(`/api/v1/pastes/${paste.id}`, app.baseUrl), {
      method: "PUT",
      headers,
      body,
    })
    expect(updated.status).toBe(200)
  } finally {
    await db.$client.end()
  }
})
