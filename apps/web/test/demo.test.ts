import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { createAuth } from "@workspace/auth"
import { DEMO_LOCKED_MESSAGE } from "@workspace/auth/demo"
import { collection, paste, pasteFile, pasteStar, session, user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { getConfig } from "@/lib/config"
import { getDb } from "@/lib/db"
import { DEMO_EMAIL, DEMO_USER_ID, demoPassword } from "@/lib/demo/guest"
import { resetDemo, viewHistory } from "@/lib/demo/reset"
import { DEMO_COLLECTIONS, DEMO_PASTES } from "@/lib/demo/seed"
import { hasDatabase, resetDatabase } from "./harness"

// DEMO_MODE: one shared guest account, back to the example data on every reset.

const describeDb = hasDatabase ? describe : describe.skip
const SECRET = "test-secret-that-is-long-enough-for-better-auth"
const BASE = "http://localhost:3000"

describe("demo configuration", () => {
  test("is off unless DEMO_MODE is set", () => {
    expect(getConfig({}).demoMode).toBe(false)
    expect(getConfig({ DEMO_MODE: "true" }).demoMode).toBe(true)
    expect(() => getConfig({ DEMO_MODE: "maybe" })).toThrow("DEMO_MODE")
  })
})

describe("demo example data", () => {
  test("uses unique slugs and only collections that exist", () => {
    const slugs = DEMO_PASTES.map((example) => example.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    const collections = new Set<string>(DEMO_COLLECTIONS.map((entry) => entry.slug))
    for (const example of DEMO_PASTES) {
      if (example.collection) expect(collections.has(example.collection)).toBe(true)
    }
  })

  test("draws the same view history every time", () => {
    expect(viewHistory("demo-welcome", 100, 10)).toEqual(viewHistory("demo-welcome", 100, 10))
    expect(viewHistory("demo-welcome", 100, 400)).toHaveLength(30)
    expect(viewHistory("demo-welcome", 100, 0.1)).toHaveLength(1)
  })

  test("derives the guest password from the secret", () => {
    expect(demoPassword("a")).not.toBe(demoPassword("b"))
    expect(demoPassword("a")).toBe(demoPassword("a"))
  })
})

describeDb("demo reset", () => {
  afterAll(resetDatabase)
  beforeEach(resetDatabase)

  const makeAuth = (demo: boolean) =>
    createAuth({ db: getDb(), secret: SECRET, baseURL: BASE, demo, allowSignUp: false })

  function post(auth: ReturnType<typeof makeAuth>, path: string, body: unknown, cookie?: string) {
    return auth.handler(
      new Request(`${BASE}/api/auth${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: BASE,
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify(body),
      }),
    )
  }

  test("creates the guest with the example pastes, files and collections", async () => {
    expect(await resetDemo(getDb(), SECRET)).toBe(true)
    const db = getDb()
    expect(await db.select().from(user).where(eq(user.id, DEMO_USER_ID))).toHaveLength(1)
    expect(await db.select().from(paste)).toHaveLength(DEMO_PASTES.length)
    expect(await db.select().from(collection)).toHaveLength(DEMO_COLLECTIONS.length)
    const files = DEMO_PASTES.reduce((sum, example) => sum + example.files.length, 0)
    expect(await db.select().from(pasteFile)).toHaveLength(files)
    expect(await db.select().from(pasteStar)).toHaveLength(
      DEMO_PASTES.filter((example) => example.starred).length,
    )
  })

  test("puts edited, added and deleted pastes back, and keeps visitors signed in", async () => {
    await resetDemo(getDb(), SECRET)
    const db = getDb()
    const auth = makeAuth(true)
    const signedIn = await post(auth, "/sign-in/email", {
      email: DEMO_EMAIL,
      password: demoPassword(SECRET),
    })
    expect(signedIn.status).toBe(200)

    await db.update(paste).set({ title: "Vandalised" }).where(eq(paste.slug, "demo-welcome"))
    await db.delete(paste).where(eq(paste.slug, "demo-retry"))
    await db.insert(paste).values({
      slug: "visitor-paste",
      ownerId: DEMO_USER_ID,
      title: "mine",
      visibility: "public",
    })
    await db.update(user).set({ name: "Somebody" }).where(eq(user.id, DEMO_USER_ID))

    await resetDemo(getDb(), SECRET)
    const slugs = (await db.select().from(paste)).map((row) => row.slug).sort()
    expect(slugs).toEqual(DEMO_PASTES.map((example) => example.slug).sort())
    const [welcome] = await db.select().from(paste).where(eq(paste.slug, "demo-welcome"))
    expect(welcome?.title).toBe("Welcome to the Sniptide demo")
    const [guest] = await db.select().from(user).where(eq(user.id, DEMO_USER_ID))
    expect(guest?.name).toBe("Guest")
    expect(await db.select().from(session).where(eq(session.userId, DEMO_USER_ID))).toHaveLength(1)
  })

  test("refuses to change or remove the guest's sign-in details", async () => {
    await resetDemo(getDb(), SECRET)
    const auth = makeAuth(true)
    const response = await post(auth, "/sign-in/email", {
      email: DEMO_EMAIL,
      password: demoPassword(SECRET),
    })
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ")

    for (const [path, body] of [
      [
        "/change-password",
        { currentPassword: demoPassword(SECRET), newPassword: "a-new-password-1" },
      ],
      ["/change-email", { newEmail: "other@example.com" }],
      ["/delete-user", { password: demoPassword(SECRET) }],
    ] as const) {
      const blocked = await post(auth, path, body, cookie)
      expect(blocked.status).toBe(403)
      expect(((await blocked.json()) as { message: string }).message).toBe(DEMO_LOCKED_MESSAGE)
    }
    expect(await getDb().select().from(user).where(eq(user.id, DEMO_USER_ID))).toHaveLength(1)
  })

  test("leaves those calls alone on a normal instance", async () => {
    await resetDemo(getDb(), SECRET)
    const auth = makeAuth(false)
    const response = await post(auth, "/sign-in/email", {
      email: DEMO_EMAIL,
      password: demoPassword(SECRET),
    })
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ")
    const changed = await post(auth, "/change-email", { newEmail: "other@example.com" }, cookie)
    expect(changed.status).not.toBe(403)
  })
})
