import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { collection, pasteRevision } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { getDb } from "@/lib/db"
import {
  autosavePaste,
  finishEditing,
  restoreRevision,
  type SavePasteInput,
  savePaste,
} from "@/lib/pastes/actions"
import { SNAPSHOT_LIMIT } from "@/lib/pastes/snapshot"
import { getPaste, sharePaste } from "@/lib/pastes/store"
import { hasDatabase, pasteRow, resetDatabase, seedUser, signInAs } from "./harness"

// Rolling a paste back to an earlier revision: its title, description and files return, nothing
// about how it is shared does, and the rollback is itself a revision that can be undone.

const describeDb = hasDatabase ? describe : describe.skip

const input = (overrides: Partial<SavePasteInput> = {}): SavePasteInput => ({
  title: "v1",
  description: "first",
  files: [{ name: "a.txt", content: "one" }],
  visibility: "unlisted",
  expiry: "never",
  slug: "",
  collection: "mine",
  password: null,
  burnAfterRead: false,
  ...overrides,
})

async function create(overrides: Partial<SavePasteInput> = {}) {
  const result = await savePaste(input(overrides))
  if (!result.ok) throw new Error(result.error)
  return result.slug
}

async function edit(slug: string, overrides: Partial<SavePasteInput>) {
  const result = await savePaste(input({ expiry: "keep", ...overrides }), slug)
  if (!result.ok) throw new Error(result.error)
}

async function history(slug: string) {
  const paste = await getPaste(slug)
  if (!paste) throw new Error("missing paste")
  // Newest first, as the page shows it.
  return paste.revisions
}

describeDb("restoreRevision", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
    await seedUser("friend")
    await seedUser("stranger")
    signInAs("owner")
    await getDb()
      .insert(collection)
      .values([
        { ownerId: "owner", slug: "mine", name: "Mine" },
        { ownerId: "owner", slug: "other", name: "Other" },
      ])
  })

  test("brings back the title, description and files, and records the rollback", async () => {
    const slug = await create()
    await edit(slug, {
      title: "v2",
      description: "second",
      files: [{ name: "b.md", content: "two" }],
    })
    await edit(slug, { title: "v3", files: [{ name: "b.md", content: "three" }] })

    const [, , created] = await history(slug)
    expect(created?.message).toBe("Created")
    const result = await restoreRevision(slug, created?.id ?? -1)
    expect(result.ok).toBe(true)

    const restored = await getPaste(slug)
    expect(restored).toMatchObject({ title: "v1", description: "first" })
    expect(restored?.files.map((file) => [file.name, file.content])).toEqual([["a.txt", "one"]])
    expect(restored?.bytes).toBe(3)
    expect(restored?.revisions.map((revision) => revision.message)).toEqual([
      "Restored revision 1",
      "Edited",
      "Edited",
      "Created",
    ])
  })

  test("the version it replaced can be restored again", async () => {
    const slug = await create()
    await edit(slug, { title: "v2", files: [{ name: "a.txt", content: "two" }] })
    const [latest, created] = await history(slug)

    await restoreRevision(slug, created?.id ?? -1)
    expect((await getPaste(slug))?.title).toBe("v1")
    await restoreRevision(slug, latest?.id ?? -1)

    const back = await getPaste(slug)
    expect(back?.title).toBe("v2")
    expect(back?.files[0]?.content).toBe("two")
    expect(back?.revisions[0]?.message).toBe("Restored revision 2")
  })

  test("leaves the link, visibility, collection, expiry and password alone", async () => {
    const slug = await create({ password: "hunter22", expiry: "1w" })
    const before = await pasteRow(slug)
    await edit(slug, { title: "v2", visibility: "public", collection: "other", password: "" })
    const created = (await history(slug))[1]

    await restoreRevision(slug, created?.id ?? -1)
    const after = await pasteRow(slug)
    expect(after).toMatchObject({
      slug,
      visibility: "public",
      collection: "other",
      title: "v1",
    })
    expect(after?.passwordHash).toBe(before?.passwordHash ?? null)
    expect(after?.expiresAt).toEqual(before?.expiresAt ?? null)
  })

  test("a burst of auto-saves is restored as the state it ended in", async () => {
    const slug = await create()
    const first = await getPaste(slug)
    let version = first?.updatedAt ?? 0
    for (const title of ["a", "ab", "abc"]) {
      const saved = await autosavePaste(slug, input({ title, expiry: "keep" }), version)
      if (!saved.ok || "conflict" in saved) throw new Error("expected a save")
      version = saved.version
    }
    await finishEditing(slug)
    const next = await autosavePaste(slug, input({ title: "later", expiry: "keep" }), version)
    if (!next.ok || "conflict" in next) throw new Error("expected a save")

    const [, batch] = await history(slug)
    expect(batch?.message).toBe("Edited")
    await restoreRevision(slug, batch?.id ?? -1)
    expect((await getPaste(slug))?.title).toBe("abc")
  })

  test("a save from an editor opened before the rollback is turned away", async () => {
    const slug = await create()
    await edit(slug, { title: "v2" })
    const opened = (await getPaste(slug))?.updatedAt ?? 0
    const created = (await history(slug))[1]

    await restoreRevision(slug, created?.id ?? -1)
    const stale = await autosavePaste(slug, input({ title: "typing", expiry: "keep" }), opened)
    expect(stale).toMatchObject({ ok: false, conflict: true })
    expect((await getPaste(slug))?.title).toBe("v1")
  })

  test("refuses the current version, history without a copy, and other pastes' revisions", async () => {
    const slug = await create()
    const other = await create({ title: "other" })
    await edit(slug, { title: "v2" })
    const [latest, created] = await history(slug)
    const [otherCreated] = await history(other)

    expect(await restoreRevision(slug, latest?.id ?? -1)).toEqual({
      ok: false,
      error: "That is the current version.",
    })
    expect(await restoreRevision(slug, otherCreated?.id ?? -1)).toEqual({
      ok: false,
      error: "That version can't be restored.",
    })
    expect(await restoreRevision(slug, 987654321)).toMatchObject({ ok: false })

    await getDb()
      .update(pasteRevision)
      .set({ snapshot: null })
      .where(eq(pasteRevision.id, created?.id ?? -1))
    expect((await history(slug)).map((revision) => revision.restorable)).toEqual([true, false])
    expect(await restoreRevision(slug, created?.id ?? -1)).toMatchObject({ ok: false })
    expect((await getPaste(slug))?.title).toBe("v2")
  })

  test("only people who can edit the paste can roll it back", async () => {
    const slug = await create()
    await edit(slug, { title: "v2" })
    const created = (await history(slug))[1]
    expect(await sharePaste(slug, "friend", "view")).toBe(true)

    for (const viewer of ["stranger", "friend", null]) {
      signInAs(viewer)
      const result = await restoreRevision(slug, created?.id ?? -1).catch(() => ({ ok: false }))
      expect(result.ok).toBe(false)
    }
    signInAs("owner")
    expect((await getPaste(slug))?.title).toBe("v2")

    await sharePaste(slug, "friend", "edit")
    signInAs("friend")
    expect((await restoreRevision(slug, created?.id ?? -1)).ok).toBe(true)
    signInAs("owner")
    expect((await getPaste(slug))?.title).toBe("v1")
  })

  test("only the newest revisions keep a copy", async () => {
    const slug = await create()
    for (let index = 0; index < SNAPSHOT_LIMIT + 5; index += 1) {
      await edit(slug, { title: `v${index + 2}` })
    }
    // The page lists 20 at a time, newest first.
    expect((await history(slug)).every((revision) => revision.restorable)).toBe(true)
    const row = await pasteRow(slug)
    const all = await getDb()
      .select()
      .from(pasteRevision)
      .where(eq(pasteRevision.pasteId, row?.id ?? ""))
    expect(all.filter((revision) => revision.snapshot).length).toBe(SNAPSHOT_LIMIT)
    expect(all.length).toBe(SNAPSHOT_LIMIT + 6)
  })
})
