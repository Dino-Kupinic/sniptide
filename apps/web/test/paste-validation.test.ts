import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { MAX_PASTE_BYTES, parsePasteInput, pasteSchema } from "@/lib/pastes/schema"
import { createPaste, getOwnPaste, updatePaste } from "@/lib/pastes/store"
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

test("paste limits count UTF-8 bytes, including the exact boundary", () => {
  expect(pasteSchema.safeParse(input("é".repeat(MAX_PASTE_BYTES / 2))).success).toBe(true)
  expect(pasteSchema.safeParse(input("é".repeat(MAX_PASTE_BYTES / 2 + 1))).success).toBe(false)
  expect(parsePasteInput(input("const x = 1")).files[0]?.language).toBe("typescript")
})

const describeDb = hasDatabase ? describe : describe.skip
describeDb("persistence validation", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
    signInAs("owner")
  })
  test("direct creation and editing cannot bypass size and filename rules", async () => {
    await expect(createPaste(input("é".repeat(MAX_PASTE_BYTES)))).rejects.toThrow("512 KB")
    const saved = await createPaste(input("original"))
    await expect(
      updatePaste(saved.slug, input("é".repeat(MAX_PASTE_BYTES)), "Edited"),
    ).rejects.toThrow("512 KB")
    const duplicate = input("hi")
    duplicate.files.push({ name: "a.ts", content: "other", language: "text" })
    await expect(updatePaste(saved.slug, duplicate, "Edited")).rejects.toThrow("unique")
    expect((await getOwnPaste(saved.slug))?.files[0]?.content).toBe("original")
  })
})
