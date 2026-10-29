import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { signupSource } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { SIGNUP_SOURCE_WINDOW_DAYS, SIGNUP_SOURCES } from "@/lib/signup-source"
import { answerSignupSource } from "@/lib/signup-source-actions"
import { shouldAskSignupSource } from "@/lib/signup-source-prompt"
import { DAY } from "@/lib/time"
import { hasDatabase, resetDatabase, seedUser, signInAs } from "./harness"

const describeDb = hasDatabase ? describe : describe.skip

async function stored(userId = "ada") {
  const [row] = await getDb().select().from(signupSource).where(eq(signupSource.userId, userId))
  return row?.source
}

describeDb("signup source", () => {
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("ada")
    signInAs("ada")
  })
  afterAll(resetDatabase)

  test("stores a listed answer and keeps the first one", async () => {
    expect(await answerSignupSource("hacker_news")).toEqual({ ok: true })
    expect(await answerSignupSource("reddit")).toEqual({ ok: true })
    expect(await stored()).toBe("hacker_news")
  })

  test("records a dismissal so the question is not asked again", async () => {
    const user = { id: "ada", createdAt: new Date() }
    expect(await shouldAskSignupSource(user)).toBe(true)
    expect(await answerSignupSource("skipped")).toEqual({ ok: true })
    expect(await stored()).toBe("skipped")
    expect(await shouldAskSignupSource(user)).toBe(false)
  })

  test("rejects answers outside the list and signed-out requests", async () => {
    expect((await answerSignupSource("a friend of a friend")).ok).toBe(false)
    expect((await answerSignupSource("")).ok).toBe(false)
    expect(await stored()).toBeUndefined()

    signInAs(null)
    expect((await answerSignupSource("reddit")).ok).toBe(false)
    expect(await stored()).toBeUndefined()
  })

  test("only asks recent accounts", async () => {
    const now = new Date("2026-11-20T12:00:00Z")
    const age = (days: number) => ({ id: "ada", createdAt: new Date(now.getTime() - days * DAY) })
    expect(await shouldAskSignupSource(age(1), now)).toBe(true)
    expect(await shouldAskSignupSource(age(SIGNUP_SOURCE_WINDOW_DAYS - 1), now)).toBe(true)
    expect(await shouldAskSignupSource(age(SIGNUP_SOURCE_WINDOW_DAYS + 1), now)).toBe(false)
  })

  test("deleting the account removes the answer", async () => {
    await answerSignupSource("x")
    await resetDatabase()
    expect(await stored()).toBeUndefined()
  })
})

describe("signup source list", () => {
  test("every option has a label in each language", async () => {
    for (const locale of ["en", "de", "es", "ja", "zh"]) {
      const messages = (await import(`@/messages/${locale}/workspace.json`)).default
      for (const source of SIGNUP_SOURCES)
        expect(messages.Workspace.signupSource.options[source]).toBeTruthy()
    }
  })
})
