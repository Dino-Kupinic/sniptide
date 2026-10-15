import { beforeEach, describe, expect, test } from "bun:test"
import { paste, pasteFile, pasteRevision } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { createCapture } from "@/lib/api/pastes"
import { getDb } from "@/lib/db"
import { createPaste } from "@/lib/pastes/store"
import { hasDatabase, migrate, resetDatabase, seedUser, signInAs } from "./harness"

const describeDb = hasDatabase ? describe : describe.skip

describeDb("insertPaste", () => {
  beforeEach(async () => {
    await migrate()
    await resetDatabase()
    await seedUser("owner")
    signInAs("owner")
  })

  test("the editor and the token API each store one paste, one file, and a Created revision", async () => {
    const created = await createPaste({
      title: "from editor",
      description: "",
      files: [{ name: "a.txt", content: "hello", language: "text" }],
      visibility: "private",
      expiry: "never",
      slug: "editor-one",
      collection: null,
      password: null,
      burnAfterRead: false,
    })
    expect(created.slug).toBe("editor-one")

    const capture = await createCapture("owner", {
      title: "from api",
      description: "",
      files: [{ name: "b.txt", content: "world" }],
      visibility: "private",
    })
    expect(capture.title).toBe("from api")

    const rows = await getDb().select().from(paste)
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      const files = await getDb().select().from(pasteFile).where(eq(pasteFile.pasteId, row.id))
      const revisions = await getDb()
        .select()
        .from(pasteRevision)
        .where(eq(pasteRevision.pasteId, row.id))
      expect(files).toHaveLength(1)
      expect(revisions).toHaveLength(1)
      expect(revisions[0]?.message).toBe("Created")
    }
  })
})
