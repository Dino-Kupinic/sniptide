import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { boundUserFields } from "@workspace/auth/user-fields"
import { user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { POST } from "@/app/api/auth/[...all]/route"
import { getDb } from "@/lib/db"
import { hasDatabase, resetDatabase } from "./harness"

// The settings page bounds names, avatars and preferences, but better-auth's own endpoints accept
// them too. The same bounds must hold there.

const describeDb = hasDatabase ? describe : describe.skip

const BASE = "http://localhost:3000"
const AVATAR = `data:image/png;base64,${"A".repeat(100)}`

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request(`${BASE}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  )
}

async function signUp(extra: Record<string, unknown> = {}) {
  return post("/sign-up/email", {
    email: "someone@example.com",
    password: "long-enough-password",
    name: "someone",
    username: "someone",
    ...extra,
  })
}

describe("boundUserFields", () => {
  test("shortens names and drops unusable images when an account is created", () => {
    const data = boundUserFields(
      { name: ` ${"n".repeat(100)} `, image: "javascript:alert(1)" },
      "create",
    )
    expect(data.name).toHaveLength(60)
    expect(data.image).toBeNull()
    expect(boundUserFields({ image: "https://avatars.example/u/1" }, "create").image).toBe(
      "https://avatars.example/u/1",
    )
  })

  test("refuses the same on update", () => {
    expect(() => boundUserFields({ name: "n".repeat(61) }, "update")).toThrow()
    expect(() => boundUserFields({ name: "   " }, "update")).toThrow()
    expect(() => boundUserFields({ image: "https://tracker.example/p.gif" }, "update")).toThrow()
    expect(() =>
      boundUserFields({ image: `data:image/png;base64,${"A".repeat(70_000)}` }, "update"),
    ).toThrow()
    expect(boundUserFields({ image: AVATAR, name: "Ada" }, "update")).toEqual({
      image: AVATAR,
      name: "Ada",
    })
    expect(boundUserFields({ image: null }, "update")).toEqual({ image: null })
  })

  test("only takes small JSON objects as preferences", () => {
    expect(() => boundUserFields({ preferences: "x".repeat(5000) }, "update")).toThrow()
    expect(() => boundUserFields({ preferences: "[1,2]" }, "create")).toThrow()
    expect(() => boundUserFields({ preferences: "not json" }, "update")).toThrow()
    expect(boundUserFields({ preferences: '{"lineNumbers":true}' }, "update").preferences).toBe(
      '{"lineNumbers":true}',
    )
  })
})

describeDb("/api/auth", () => {
  afterAll(resetDatabase)
  beforeEach(resetDatabase)

  test("sign-up keeps a long name to 60 characters", async () => {
    const response = await signUp({ name: "n".repeat(500) })
    expect(response.status).toBe(200)
    const [row] = await getDb().select().from(user)
    expect(row?.name).toHaveLength(60)
  })

  test("sign-up refuses oversized preferences", async () => {
    const response = await signUp({ preferences: JSON.stringify({ junk: "x".repeat(5000) }) })
    expect(response.ok).toBe(false)
    expect(await getDb().select().from(user)).toHaveLength(0)
  })

  test("update-user holds the same bounds as the settings page", async () => {
    const signedUp = await signUp()
    const cookie = signedUp.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ")
    const update = (body: unknown) => post("/update-user", body, { cookie })

    expect((await update({ name: "n".repeat(61) })).ok).toBe(false)
    expect((await update({ image: "https://tracker.example/pixel.gif" })).ok).toBe(false)
    expect((await update({ preferences: "x".repeat(5000) })).ok).toBe(false)

    expect((await update({ name: "Ada", image: AVATAR })).status).toBe(200)
    const [row] = await getDb().select().from(user).where(eq(user.email, "someone@example.com"))
    expect(row?.name).toBe("Ada")
    expect(row?.image).toBe(AVATAR)
  })

  test("refuses bodies over 128 KB before better-auth reads them", async () => {
    const response = await post("/sign-up/email", JSON.stringify({ name: "x".repeat(200_000) }))
    expect(response.status).toBe(413)
  })
})
