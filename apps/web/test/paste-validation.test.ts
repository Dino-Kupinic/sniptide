import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test"
import { user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { savePaste } from "@/lib/pastes/actions"
import { maxPasteBytes, parsePasteInput, pasteSchema } from "@/lib/pastes/schema"
import { createPaste, getPaste, isSlugAvailable, updatePaste } from "@/lib/pastes/store"
import type { PasteInput } from "@/lib/pastes/types"
import { hasDatabase, resetDatabase, seedUser, signInAs } from "./harness"

const input = (content: string): PasteInput => ({
  title: "A paste",
  description: "",
  files: [{ name: "a.ts", language: "text", content }],
  visibility: "unlisted",
  expiry: "never",
  slug: "",
  collection: null,
  password: null,
  burnAfterRead: false,
})

afterEach(() => {
  delete process.env.MAX_PASTE_SIZE
})

test("paste limits count UTF-8 bytes, including the exact boundary", () => {
  const limit = maxPasteBytes()
  expect(limit).toBe(1024 * 1024)
  expect(pasteSchema.safeParse(input("é".repeat(limit / 2))).success).toBe(true)
  expect(pasteSchema.safeParse(input("é".repeat(limit / 2 + 1))).success).toBe(false)
  expect(parsePasteInput(input("const x = 1")).files[0]?.language).toBe("typescript")
})

test("the limit comes from MAX_PASTE_SIZE and shows in the error", () => {
  process.env.MAX_PASTE_SIZE = "512KB"
  const result = pasteSchema.safeParse(input("x".repeat(512 * 1024 + 1)))
  expect(result.success).toBe(false)
  expect(result.error?.issues[0]?.message).toBe("Pastes are limited to 512 KB.")
  expect(pasteSchema.safeParse(input("x".repeat(512 * 1024))).success).toBe(true)

  process.env.MAX_PASTE_SIZE = "2MB"
  expect(pasteSchema.safeParse(input("x".repeat(1024 * 1024 + 1))).success).toBe(true)
})

const describeDb = hasDatabase ? describe : describe.skip
describeDb("persistence validation", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
    signInAs("owner")
  })
  test("custom links need a username and live in its namespace", async () => {
    expect((await savePaste({ ...input("no handle"), slug: "owner/notes" })).ok).toBe(false)
    await getDb().update(user).set({ username: "owner" }).where(eq(user.id, "owner"))
    signInAs("owner", "owner")
    expect((await savePaste({ ...input("top level"), slug: "analytics" })).ok).toBe(false)
    expect((await savePaste({ ...input("elsewhere"), slug: "other/notes" })).ok).toBe(false)
    for (const slug of ["owner/analytics", "owner/settings", "owner/Notes"]) {
      expect(await isSlugAvailable(slug, "owner")).toBe(true)
      const saved = await savePaste({ ...input("namespaced fixture"), slug })
      expect(saved).toEqual({ ok: true, slug })
      expect(await isSlugAvailable(slug, "owner")).toBe(false)
      expect((await savePaste({ ...input("duplicate link fixture"), slug })).ok).toBe(false)
    }
  })
  test("direct creation and editing cannot bypass size and filename rules", async () => {
    await expect(createPaste(input("é".repeat(maxPasteBytes())))).rejects.toThrow("1 MB")
    const saved = await createPaste(input("original"))
    await expect(
      updatePaste(saved.slug, input("é".repeat(maxPasteBytes())), "Edited"),
    ).rejects.toThrow("1 MB")
    const duplicate = input("hi")
    duplicate.files.push({ name: "a.ts", content: "other", language: "text" })
    await expect(updatePaste(saved.slug, duplicate, "Edited")).rejects.toThrow("unique")
    expect((await getPaste(saved.slug))?.files[0]?.content).toBe("original")
  })
})
