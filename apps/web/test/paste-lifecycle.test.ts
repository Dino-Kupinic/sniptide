import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { paste } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { openToAnyone, pasteState, restoredFields } from "@/lib/pastes/lifecycle"
import { passwordField, passwordIntent, storedPasswordField } from "@/lib/pastes/password-intent"
import { restorePaste, trashPaste } from "@/lib/pastes/store"
import { hasDatabase, pasteRow, resetDatabase, seedPaste, seedUser, signInAs } from "./harness"

const DAY = 86_400_000
const now = Date.parse("2026-11-03T12:00:00Z")
const at = (offset: number) => new Date(now + offset)

describe("paste lifecycle", () => {
  test.each([
    [{ deletedAt: null, burnedAt: null, expiresAt: null }, "live"],
    [{ deletedAt: null, burnedAt: null, expiresAt: at(DAY) }, "live"],
    [{ deletedAt: null, burnedAt: null, expiresAt: at(0) }, "expired"],
    [{ deletedAt: null, burnedAt: null, expiresAt: at(-DAY) }, "expired"],
    [{ deletedAt: at(-DAY), burnedAt: null, expiresAt: null }, "trashed"],
    [{ deletedAt: at(-DAY), burnedAt: null, expiresAt: at(-2 * DAY) }, "trashed"],
    [{ deletedAt: at(-DAY), burnedAt: at(-DAY), expiresAt: null }, "burned"],
    [{ deletedAt: at(-DAY), burnedAt: at(-DAY), expiresAt: at(DAY) }, "burned"],
  ] as const)("%o is %s", (record, state) => {
    expect(pasteState(record, now)).toBe(state)
  })

  test.each([
    ["public", null, false, true],
    ["unlisted", null, false, true],
    ["private", null, false, false],
    ["public", "salt:hash", false, false],
    ["unlisted", null, true, false],
  ] as const)(
    "a %s paste with password %s and burn %s is open to anyone: %s",
    (visibility, passwordHash, burnAfterRead, open) => {
      expect(openToAnyone({ visibility, passwordHash, burnAfterRead })).toBe(open)
    },
  )

  test("restoring a burned paste turns it private with burn off, a trashed one only leaves the trash", () => {
    expect(restoredFields({ burnedAt: at(0) })).toEqual({
      deletedAt: null,
      burnedAt: null,
      burnAfterRead: false,
      visibility: "private",
    })
    expect(restoredFields({ burnedAt: null })).toEqual({ deletedAt: null })
  })
})

const describeDb = hasDatabase ? describe : describe.skip

describeDb("trash and restore", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
    signInAs("owner")
  })

  test("trashing a paste twice keeps its first trash time", async () => {
    await seedPaste({ slug: "p", owner: "owner" })
    const first = new Date(Date.now() - 10 * DAY)
    await getDb().update(paste).set({ deletedAt: first }).where(eq(paste.slug, "p"))
    await trashPaste("p")
    expect((await pasteRow("p"))?.deletedAt?.getTime()).toBe(first.getTime())
  })

  test("a paste past its 30 days in the trash can't be restored before the purge runs", async () => {
    await seedPaste({ slug: "old", owner: "owner" })
    await getDb()
      .update(paste)
      .set({ deletedAt: new Date(Date.now() - 31 * DAY) })
      .where(eq(paste.slug, "old"))
    expect(await restorePaste("old")).toBe(false)
    expect((await pasteRow("old"))?.deletedAt).not.toBeNull()
  })
})

describe("password intent", () => {
  test("the password field reads as keep, remove or set, and writes back the same", () => {
    expect(passwordIntent("")).toEqual({ kind: "keep" })
    expect(passwordIntent(null)).toEqual({ kind: "remove" })
    expect(passwordIntent("hunter2")).toEqual({ kind: "set", password: "hunter2" })
    for (const field of ["", null, "hunter2"])
      expect(passwordField(passwordIntent(field))).toBe(field)
    expect(storedPasswordField(true)).toBe("")
    expect(storedPasswordField(false)).toBeNull()
  })
})
