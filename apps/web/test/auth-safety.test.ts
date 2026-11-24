import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { createAuth } from "@workspace/auth"
import { paste, user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { hasDatabase, resetDatabase, seedPaste, seedUser } from "./harness"

// A suspended account can't start a session, and an account with a paste under a legal hold can't
// be deleted, because deleting it would delete the paste.

const describeDb = hasDatabase ? describe : describe.skip

describeDb("account safety restrictions", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("ada")
  })

  // Built on first use: the runner evaluates this block even when it skips it, and getDb throws
  // without a database.
  let instance: ReturnType<typeof createAuth> | undefined
  const getAuth = () => {
    instance ??= createAuth({
      db: getDb(),
      secret: "test-secret-that-is-long-enough-for-better-auth",
      baseURL: "http://localhost:3000",
    })
    return instance
  }

  test("a suspended account can't start a session", async () => {
    const context = await getAuth().$context
    expect(await context.internalAdapter.createSession("ada")).toBeTruthy()
    await getDb().update(user).set({ suspendedAt: new Date() }).where(eq(user.id, "ada"))
    await expect(context.internalAdapter.createSession("ada")).rejects.toMatchObject({
      body: { code: "ACCOUNT_SUSPENDED" },
    })
  })

  test("an account with a held paste can't be deleted", async () => {
    const beforeDelete = getAuth().options.user.deleteUser.beforeDelete
    const ada = { id: "ada" } as Parameters<NonNullable<typeof beforeDelete>>[0]
    await expect(beforeDelete?.(ada)).resolves.toBeUndefined()
    const held = await seedPaste({ slug: "held", owner: "ada" })
    await getDb()
      .update(paste)
      .set({ moderationState: "quarantined", legalHoldCase: crypto.randomUUID() })
      .where(eq(paste.id, held.id))
    await expect(beforeDelete?.(ada)).rejects.toMatchObject({
      body: { code: "ACCOUNT_DELETION_UNAVAILABLE" },
    })
  })
})
