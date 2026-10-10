import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { byteLength } from "@/lib/format"
import { listOwnPastes, listTrash } from "@/lib/pastes/store"
import { hasDatabase, resetDatabase, seedPaste, seedUser, signInAs } from "./harness"

// The lists load summaries: sizes and languages come from SQL, and no file content is sent.

const describeDb = hasDatabase ? describe : describe.skip

describeDb("paste lists", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
    signInAs("owner")
  })

  test("summaries carry the language and UTF-8 size, not the content", async () => {
    const content = "naïve café ✓"
    await seedPaste({ slug: "live", owner: "owner", content })

    const [summary] = await listOwnPastes()
    expect(summary?.language).toBe("text")
    expect(summary?.bytes).toBe(byteLength(content))
    expect(summary).not.toHaveProperty("files")
    expect(summary).not.toHaveProperty("revisions")
  })

  test("trash lists summaries too", async () => {
    await seedPaste({ slug: "gone", owner: "owner", content: "abc", deletedAt: new Date() })

    const [summary] = await listTrash()
    expect(summary?.slug).toBe("gone")
    expect(summary?.bytes).toBe(3)
  })
})
