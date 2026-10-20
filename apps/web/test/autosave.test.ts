import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { collection, paste, pasteRevision } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { updateCapture } from "@/lib/api/pastes"
import { deleteCollection, restoreCollection } from "@/lib/collections/store"
import { getDb } from "@/lib/db"
import { autosavePaste, finishEditing, type SavePasteInput, savePaste } from "@/lib/pastes/actions"
import {
  getPaste,
  REVISION_WINDOW_MS,
  readSharedPaste,
  renamePaste,
  restorePaste,
  setPasteCollection,
  setStarred,
  trashPaste,
  updateSharing,
} from "@/lib/pastes/store"
import { hasDatabase, pasteRow, resetDatabase, seedPaste, seedUser, signInAs } from "./harness"

// What the editor's auto-save relies on: stale edits are refused instead of overwriting, a burst of
// edits makes one revision, and fields the editor leaves alone stay as they were.

const describeDb = hasDatabase ? describe : describe.skip

const input = (overrides: Partial<SavePasteInput> = {}): SavePasteInput => ({
  title: "First",
  description: "",
  files: [{ name: "a.txt", content: "hello" }],
  visibility: "unlisted",
  expiry: "never",
  slug: "",
  collection: null,
  password: null,
  burnAfterRead: false,
  ...overrides,
})

async function create(overrides: Partial<SavePasteInput> = {}) {
  const result = await savePaste(input(overrides))
  if (!result.ok) throw new Error(result.error)
  const created = await getPaste(result.slug)
  if (!created) throw new Error("created paste is missing")
  return { slug: result.slug, version: created.version }
}

async function revisions(slug: string) {
  const row = await pasteRow(slug)
  if (!row) return []
  return getDb()
    .select()
    .from(pasteRevision)
    .where(eq(pasteRevision.pasteId, row.id))
    .orderBy(pasteRevision.id)
}

describeDb("autosavePaste", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
    await seedUser("other")
    signInAs("owner")
  })

  test("saves an edit and hands back the version to send next time", async () => {
    const { slug, version } = await create()

    const first = await autosavePaste(
      slug,
      input({ title: "Second", files: [{ name: "a.txt", content: "hello world" }] }),
      version,
    )
    expect(first.ok).toBe(true)
    if (!first.ok || "conflict" in first) throw new Error("expected a save")
    expect(first.version).toBeGreaterThan(version)

    const second = await autosavePaste(slug, input({ title: "Third" }), first.version)
    expect(second.ok).toBe(true)

    const stored = await getPaste(slug)
    expect(stored?.title).toBe("Third")
    expect(stored?.version).toBe(second.ok ? second.version : -1)
  })

  test("refuses an edit made from an out-of-date copy and changes nothing", async () => {
    const { slug, version } = await create()
    const winner = await autosavePaste(slug, input({ title: "Other tab" }), version)
    if (!winner.ok) throw new Error("expected a save")

    const stale = await autosavePaste(slug, input({ title: "Stale tab" }), version)
    expect(stale).toEqual({ ok: false, conflict: true, version: winner.version, slug })
    expect((await getPaste(slug))?.title).toBe("Other tab")
  })

  test("lets only one of two saves from the same version win", async () => {
    const { slug, version } = await create()

    const results = await Promise.all([
      autosavePaste(slug, input({ title: "A" }), version),
      autosavePaste(slug, input({ title: "B" }), version),
    ])

    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(results.filter((result) => !result.ok && "conflict" in result)).toHaveLength(1)
  })

  test("reports the new link when a newer save moved the paste", async () => {
    const { slug, version } = await create()
    const moved = await autosavePaste(slug, input({ slug: "moved-link" }), version)
    if (!moved.ok) throw new Error("expected a save")
    expect(moved.slug).toBe("moved-link")

    const stale = await autosavePaste("moved-link", input({ title: "Late" }), version)
    expect(stale).toEqual({ ok: false, conflict: true, version: moved.version, slug: "moved-link" })
  })

  for (const [name, mutate] of [
    [
      "sharing settings",
      (slug: string) =>
        updateSharing(slug, {
          visibility: "private",
          burnAfterRead: true,
          allowRaw: false,
          password: "new-password",
          expiry: "1h",
        }),
    ],
    ["rename", (slug: string) => renamePaste(slug, "Renamed")],
    ["collection move", (slug: string) => setPasteCollection(slug, "other")],
    [
      "trash and restore",
      async (slug: string) => {
        await trashPaste(slug)
        await restorePaste(slug)
      },
    ],
    [
      "collection deletion",
      async () => {
        await deleteCollection("mine")
      },
    ],
    [
      "collection restoration",
      async () => {
        const removed = await deleteCollection("mine")
        if (!removed) throw new Error("missing collection")
        await restoreCollection(removed)
      },
    ],
  ] satisfies [string, (slug: string) => Promise<unknown>][]) {
    test(`rejects a stale editor after ${name} without changing recent ordering`, async () => {
      await getDb()
        .insert(collection)
        .values([
          { ownerId: "owner", slug: "mine", name: "Mine" },
          { ownerId: "owner", slug: "other", name: "Other" },
        ])
      const { slug, version } = await create({ collection: "mine" })
      const before = await pasteRow(slug)
      await mutate(slug)
      const changed = await pasteRow(slug)

      const stale = await autosavePaste(slug, input({ title: "Stale editor" }), version)
      expect(stale).toMatchObject({ ok: false, conflict: true })
      expect(await pasteRow(slug)).toEqual(changed)
      expect(changed?.updatedAt).toEqual(before?.updatedAt)
    })
  }

  test("rejects a stale browser editor after an API update", async () => {
    const { slug, version } = await create()
    await updateCapture("owner", slug, {
      title: "API edit",
      files: [{ name: "api.txt", content: "new" }],
    })
    const stale = await autosavePaste(slug, input({ title: "Stale editor" }), version)
    expect(stale).toMatchObject({ ok: false, conflict: true })
    expect((await getPaste(slug))?.title).toBe("API edit")
  })

  test("concurrent metadata writes each advance the version without moving recent order", async () => {
    const { slug, version } = await create()
    const before = await pasteRow(slug)
    await Promise.all(Array.from({ length: 8 }, (_, index) => renamePaste(slug, `Name ${index}`)))
    const after = await pasteRow(slug)
    expect(after?.version).toBe(version + 8)
    expect(after?.updatedAt).toEqual(before?.updatedAt)
    expect(await autosavePaste(slug, input(), version)).toMatchObject({ ok: false, conflict: true })
  })

  test("ordinary views and stars leave the editor version valid", async () => {
    const { slug, version } = await create()
    signInAs(null)
    expect((await readSharedPaste(slug, { visit: true })).status).toBe("ok")
    signInAs("owner")
    await setStarred(slug, true)
    expect((await pasteRow(slug))?.version).toBe(version)
    expect(await autosavePaste(slug, input({ title: "Still current" }), version)).toMatchObject({
      ok: true,
    })
  })

  test("burning and restoring a paste invalidates an editor opened before the burn", async () => {
    const { slug, version } = await create({ burnAfterRead: true })
    signInAs(null)
    expect((await readSharedPaste(slug, { reveal: true })).status).toBe("ok")
    signInAs("owner")
    expect((await pasteRow(slug))?.version).toBe(version + 1)
    await restorePaste(slug)
    expect(await autosavePaste(slug, input(), version)).toMatchObject({ ok: false, conflict: true })
  })

  test("a burst of edits makes one revision, and a later one starts another", async () => {
    const { slug, version } = await create()
    expect((await revisions(slug)).map((revision) => revision.message)).toEqual(["Created"])

    let current = version
    for (const title of ["a", "ab", "abc"]) {
      const result = await autosavePaste(slug, input({ title }), current)
      if (!result.ok) throw new Error("expected a save")
      current = result.version
    }
    expect((await revisions(slug)).map((revision) => revision.message)).toEqual([
      "Created",
      "Edited",
    ])

    // Past the window the next edit is a new revision.
    const [edited] = (await revisions(slug)).slice(-1)
    await getDb()
      .update(pasteRevision)
      .set({ createdAt: new Date(Date.now() - REVISION_WINDOW_MS - 1000) })
      .where(eq(pasteRevision.id, edited?.id ?? -1))
    await autosavePaste(slug, input({ title: "later" }), current)
    expect((await revisions(slug)).map((revision) => revision.message)).toEqual([
      "Created",
      "Edited",
      "Edited",
    ])
  })

  test("an edit that rewrites most of the paste gets a revision of its own", async () => {
    const lines = (word: string) =>
      Array.from({ length: 40 }, (_, index) => `${word} line number ${index}`).join("\n")
    const { slug, version } = await create({ files: [{ name: "a.txt", content: lines("old") }] })

    const typed = await autosavePaste(
      slug,
      input({ files: [{ name: "a.txt", content: `${lines("old")}\nmore` }] }),
      version,
    )
    if (!typed.ok || "conflict" in typed) throw new Error("expected a save")
    const small = await autosavePaste(
      slug,
      input({ files: [{ name: "a.txt", content: `${lines("old")}\nmore text` }] }),
      typed.version,
    )
    if (!small.ok || "conflict" in small) throw new Error("expected a save")
    expect(await revisions(slug)).toHaveLength(2)

    const rewrite = await autosavePaste(
      slug,
      input({ files: [{ name: "a.txt", content: lines("new") }] }),
      small.version,
    )
    if (!rewrite.ok || "conflict" in rewrite) throw new Error("expected a save")
    expect((await revisions(slug)).map((revision) => revision.message)).toEqual([
      "Created",
      "Edited",
      "Edited",
    ])

    // Small edits after it fold into the new revision again.
    await autosavePaste(
      slug,
      input({ files: [{ name: "a.txt", content: `${lines("new")}\nmore` }] }),
      rewrite.version,
    )
    expect(await revisions(slug)).toHaveLength(3)
  })

  test("closing the editor with Done ends the revision, once", async () => {
    const { slug, version } = await create()
    const first = await autosavePaste(slug, input({ title: "one" }), version)
    if (!first.ok || "conflict" in first) throw new Error("expected a save")

    await finishEditing(slug)
    await finishEditing(slug)
    expect((await revisions(slug)).map((revision) => revision.sealed)).toEqual([false, true])

    await autosavePaste(slug, input({ title: "two" }), first.version)
    expect((await revisions(slug)).map((revision) => revision.message)).toEqual([
      "Created",
      "Edited",
      "Edited",
    ])
  })

  test("Done leaves other revisions and other people's pastes alone", async () => {
    const { slug } = await create()
    await finishEditing(slug)
    expect((await revisions(slug)).map((revision) => revision.sealed)).toEqual([false])

    const edited = await autosavePaste(slug, input({ title: "one" }), (await create()).version)
    expect(edited.ok || "conflict" in edited).toBe(true)
    signInAs("other")
    await finishEditing(slug)
    expect((await revisions(slug)).every((revision) => !revision.sealed)).toBe(true)
  })

  test("explicit saves still add a revision each time", async () => {
    const { slug } = await create()
    await savePaste(input({ title: "one", expiry: "keep" }), slug)
    await savePaste(input({ title: "two", expiry: "keep" }), slug)
    expect(await revisions(slug)).toHaveLength(3)
  })

  test("keeping the expiry leaves it alone, choosing one sets it from the save", async () => {
    const { slug, version } = await create({ expiry: "1w" })
    const before = (await pasteRow(slug))?.expiresAt

    const kept = await autosavePaste(slug, input({ expiry: "keep" }), version)
    if (!kept.ok || "conflict" in kept) throw new Error("expected a save")
    expect((await pasteRow(slug))?.expiresAt).toEqual(before ?? null)
    expect(kept.expiresAt).toBe(before?.getTime() ?? null)

    const changed = await autosavePaste(slug, input({ expiry: "1h" }), kept.version)
    if (!changed.ok) throw new Error("expected a save")
    const afterHour = (await pasteRow(slug))?.expiresAt?.getTime() ?? 0
    expect(afterHour).toBeGreaterThan(Date.now())
    expect(afterHour).toBeLessThan(Date.now() + 3_700_000)
  })

  test("an empty password keeps the current one and null removes it", async () => {
    const { slug, version } = await create({ password: "hunter2hunter2" })
    const hash = (await pasteRow(slug))?.passwordHash
    expect(hash).toBeTruthy()

    const kept = await autosavePaste(slug, input({ password: "" }), version)
    if (!kept.ok || "conflict" in kept) throw new Error("expected a save")
    expect(kept.hasPassword).toBe(true)
    expect((await pasteRow(slug))?.passwordHash).toBe(hash ?? null)

    const removed = await autosavePaste(slug, input({ password: null }), kept.version)
    if (!removed.ok || "conflict" in removed) throw new Error("expected a save")
    expect(removed.hasPassword).toBe(false)
    expect((await pasteRow(slug))?.passwordHash).toBeNull()
  })

  test("refuses what a normal save refuses", async () => {
    const { slug, version } = await create()
    await seedPaste({ slug: "taken-link", owner: "owner" })

    expect(await autosavePaste(slug, input({ slug: "taken-link" }), version)).toMatchObject({
      ok: false,
      error: expect.stringContaining("taken"),
    })
    expect(await autosavePaste(slug, input({ title: "  " }), version)).toEqual({
      ok: false,
      error: "Give the paste a title.",
    })
    // "Keep the current password" needs a current password to keep.
    expect(await autosavePaste(slug, input({ password: "" }), version)).toEqual({
      ok: false,
      error: "Enter a password or turn password protection off.",
    })
    expect((await pasteRow(slug))?.passwordHash).toBeNull()
  })

  test("does not touch someone else's paste", async () => {
    await seedPaste({ slug: "theirs", owner: "other", title: "Theirs" })

    const result = await autosavePaste("theirs", input({ title: "Mine now" }), 0)
    expect(result).toEqual({ ok: false, error: "That paste no longer exists." })
    expect((await pasteRow("theirs"))?.title).toBe("Theirs")
  })

  test("refuses when signed out", async () => {
    const { slug, version } = await create()
    signInAs(null)
    await expect(autosavePaste(slug, input({ title: "x" }), version)).rejects.toThrow()
    expect((await getDb().select().from(paste).where(eq(paste.slug, slug)))[0]?.title).toBe("First")
  })
})
