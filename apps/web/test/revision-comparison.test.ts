import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { pasteRevision } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { savePaste } from "@/lib/pastes/actions"
import { getComparisonRevisions, getPaste, sharePaste } from "@/lib/pastes/store"
import { hasDatabase, resetDatabase, seedUser, signInAs } from "./harness"

const describeDb = hasDatabase ? describe : describe.skip
describeDb("revision comparison access", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
    await seedUser("friend")
    signInAs("owner")
  })
  test("only app readers can load retained snapshots and pruned entries stay in history", async () => {
    const result = await savePaste({
      title: "Compare me",
      description: "original",
      files: [{ name: "a.txt", content: "one" }],
      visibility: "private",
      expiry: "never",
      slug: "",
      collection: null,
      password: null,
      burnAfterRead: false,
    })
    if (!result.ok) throw new Error(result.error)
    const rows = await getComparisonRevisions(result.slug)
    expect(rows?.[0]?.snapshot?.title).toBe("Compare me")
    signInAs(null)
    expect(await getComparisonRevisions(result.slug)).toBeNull()
    signInAs("friend")
    expect(await getComparisonRevisions(result.slug)).toBeNull()
    signInAs("owner")
    await sharePaste(result.slug, "friend", "view")
    signInAs("friend")
    expect((await getComparisonRevisions(result.slug))?.length).toBe(1)
    const id = rows?.[0]?.id
    if (!id) throw new Error("missing revision")
    await getDb().update(pasteRevision).set({ snapshot: null }).where(eq(pasteRevision.id, id))
    expect(await getComparisonRevisions(result.slug)).toEqual([])
    expect((await getPaste(result.slug))?.revisions[0]?.restorable).toBe(false)
  })
})
