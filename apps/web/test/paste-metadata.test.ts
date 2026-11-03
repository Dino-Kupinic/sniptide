import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { paste, pasteFile } from "@workspace/db/schema"
import { eq, sql } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { hasDatabase, resetDatabase, seedPaste, seedUser } from "./harness"

const describeDb = hasDatabase ? describe : describe.skip

describeDb("database-owned paste metadata", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("metadata-owner")
  })
  async function metadata(id: string) {
    const [row] = await getDb()
      .select({ language: paste.firstLanguage, bytes: paste.bytes })
      .from(paste)
      .where(eq(paste.id, id))
    return row
  }
  test("the upgrade repairs stale byte totals and backfills empty and populated pastes", async () => {
    const migration = await Bun.file(
      new URL(
        "../../../packages/db/migrations/20261028075842_condemned_stephen_strange/migration.sql",
        import.meta.url,
      ),
    ).text()
    await getDb().transaction(async (tx) => {
      await tx.execute(
        sql`CREATE TEMP TABLE paste (id int PRIMARY KEY, bytes int NOT NULL) ON COMMIT DROP`,
      )
      await tx.execute(
        sql`CREATE TEMP TABLE paste_file (id int, paste_id int, position int, language text, content text) ON COMMIT DROP`,
      )
      await tx.execute(sql`INSERT INTO paste VALUES (1, 999), (2, 999)`)
      await tx.execute(
        sql`INSERT INTO paste_file VALUES (2, 1, 0, 'rust', 'é'), (1, 1, 0, 'go', 'abc')`,
      )
      for (const statement of migration.split("--> statement-breakpoint")) {
        if (!statement.includes("CREATE OR REPLACE FUNCTION")) await tx.execute(sql.raw(statement))
      }
      const rows = await tx.execute(sql`SELECT id, bytes, first_language FROM paste ORDER BY id`)
      expect([...rows]).toEqual([
        { id: 1, bytes: 5, first_language: "go" },
        { id: 2, bytes: 0, first_language: null },
      ])
    })
  })

  test("raw file insert, reorder, rename language and delete maintain first language and UTF-8 bytes", async () => {
    const db = getDb()
    const item = await seedPaste({
      slug: "metadata",
      owner: "metadata-owner",
      content: "é",
      language: "text",
    })
    expect(await metadata(item.id)).toEqual({ language: "text", bytes: 2 })
    const [file] = await db
      .insert(pasteFile)
      .values({
        pasteId: item.id,
        position: -1,
        name: "b.ts",
        language: "typescript",
        content: "abc",
      })
      .returning()
    if (!file) throw new Error("missing file")
    expect(await metadata(item.id)).toEqual({ language: "typescript", bytes: 5 })
    await db.update(pasteFile).set({ position: 1, content: "😀" }).where(eq(pasteFile.id, file.id))
    expect(await metadata(item.id)).toEqual({ language: "text", bytes: 6 })
    await db
      .update(pasteFile)
      .set({ position: -1, language: "javascript" })
      .where(eq(pasteFile.id, file.id))
    expect(await metadata(item.id)).toEqual({ language: "javascript", bytes: 6 })
    await db.delete(pasteFile).where(eq(pasteFile.pasteId, item.id))
    expect(await metadata(item.id)).toEqual({ language: null, bytes: 0 })
  })
  test("position ties use file id and a file move refreshes both parents", async () => {
    const db = getDb()
    const a = await seedPaste({ slug: "meta-a", owner: "metadata-owner", content: "a" })
    const b = await seedPaste({ slug: "meta-b", owner: "metadata-owner", content: "b" })
    await db.delete(pasteFile).where(eq(pasteFile.pasteId, a.id))
    await db.insert(pasteFile).values([
      {
        id: 2000000002,
        pasteId: a.id,
        position: 0,
        name: "later",
        language: "rust",
        content: "rr",
      },
      {
        id: 2000000001,
        pasteId: a.id,
        position: 0,
        name: "first",
        language: "go",
        content: "ggg",
      },
    ])
    expect(await metadata(a.id)).toEqual({ language: "go", bytes: 5 })
    await db
      .update(pasteFile)
      .set({ pasteId: b.id, position: -1 })
      .where(eq(pasteFile.id, 2000000001))
    expect(await metadata(a.id)).toEqual({ language: "rust", bytes: 2 })
    expect(await metadata(b.id)).toEqual({ language: "go", bytes: 4 })
  })
  test("concurrent raw inserts serialize their aggregate refresh", async () => {
    const item = await seedPaste({ slug: "meta-race", owner: "metadata-owner", content: "x" })
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        getDb()
          .insert(pasteFile)
          .values({
            pasteId: item.id,
            position: i + 1,
            name: `f${i}`,
            language: "go",
            content: "é",
          }),
      ),
    )
    expect(await metadata(item.id)).toEqual({ language: "text", bytes: 41 })
  })
})
