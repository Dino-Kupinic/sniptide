import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { collection, pasteShare, pasteStar } from "@workspace/db/schema"
import { deleteCollections, restoreCollections } from "@/lib/collections/actions"
import { getDb } from "@/lib/db"
import {
  deletePastesForever,
  leaveShares,
  restorePastes,
  restoreShares,
  setPastesCollection,
  setPastesStarred,
  setPastesVisibility,
  trashPastes,
} from "@/lib/pastes/actions"
import { hasDatabase, pasteRow, resetDatabase, seedPaste, seedUser, signInAs } from "./harness"

// The selection bar's bulk actions: each one runs the single-row checks on every slug, so a
// selection can't reach someone else's paste.

const describeDb = hasDatabase ? describe : describe.skip

describeDb("bulk paste actions", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
    await seedUser("other")
    signInAs("owner")
    await seedPaste({ slug: "a", owner: "owner", visibility: "public", collection: "old" })
    await seedPaste({ slug: "b", owner: "owner", visibility: "private" })
    await seedPaste({ slug: "theirs", owner: "other", visibility: "public" })
    await getDb()
      .insert(collection)
      .values([
        { ownerId: "owner", slug: "old", name: "old" },
        { ownerId: "owner", slug: "new", name: "new" },
      ])
  })

  test("trash and restore move every selected paste, and skip someone else's", async () => {
    await trashPastes(["a", "b", "theirs"])
    expect((await pasteRow("a"))?.deletedAt).not.toBeNull()
    expect((await pasteRow("b"))?.deletedAt).not.toBeNull()
    expect((await pasteRow("theirs"))?.deletedAt).toBeNull()

    expect(await restorePastes(["a", "b"])).toEqual({ ok: true })
    expect((await pasteRow("a"))?.deletedAt).toBeNull()
    expect((await pasteRow("b"))?.deletedAt).toBeNull()
    expect(await restorePastes(["theirs"])).toMatchObject({ ok: false })
  })

  test("delete forever removes only trashed pastes", async () => {
    await trashPastes(["a"])
    await deletePastesForever(["a", "b"])
    expect(await pasteRow("a")).toBeUndefined()
    expect(await pasteRow("b")).toBeDefined()
  })

  test("collection and visibility changes apply to the viewer's own pastes", async () => {
    expect(await setPastesCollection(["a", "b", "theirs"], "new")).toEqual({ ok: true })
    expect((await pasteRow("a"))?.collection).toBe("new")
    expect((await pasteRow("b"))?.collection).toBe("new")
    expect((await pasteRow("theirs"))?.collection).toBeNull()
    expect(await setPastesCollection(["a"], "missing")).toMatchObject({ ok: false })

    await setPastesVisibility(["a", "b", "theirs"], "unlisted")
    expect((await pasteRow("a"))?.visibility).toBe("unlisted")
    expect((await pasteRow("b"))?.visibility).toBe("unlisted")
    expect((await pasteRow("theirs"))?.visibility).toBe("public")
    await expect(setPastesVisibility(["a"], "secret" as "public")).rejects.toThrow()
  })

  test("stars go on and come off together", async () => {
    await setPastesStarred(["a", "b", "theirs"], true)
    expect((await getDb().select().from(pasteStar)).length).toBe(3)
    await setPastesStarred(["a", "b", "theirs"], false)
    expect((await getDb().select().from(pasteStar)).length).toBe(0)
  })

  test("leaving shares can be undone", async () => {
    const theirs = await pasteRow("theirs")
    if (!theirs) throw new Error("missing paste")
    await getDb().insert(pasteShare).values({ pasteId: theirs.id, userId: "owner", access: "view" })
    await leaveShares(["theirs"])
    expect((await getDb().select().from(pasteShare))[0]?.leftAt).not.toBeNull()
    expect(await restoreShares(["theirs"])).toEqual({ ok: true })
    expect((await getDb().select().from(pasteShare))[0]?.leftAt).toBeNull()
  })

  test("a selection is capped and needs a signed-in account", async () => {
    const many = Array.from({ length: 101 }, (_, index) => `p${index}`)
    await expect(trashPastes(many)).rejects.toThrow()
    await expect(trashPastes([])).rejects.toThrow()
    signInAs(null)
    await expect(trashPastes(["a"])).rejects.toThrow()
  })
})

describeDb("bulk collection delete", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
    signInAs("owner")
    await getDb()
      .insert(collection)
      .values([
        { ownerId: "owner", slug: "one", name: "one" },
        { ownerId: "owner", slug: "two", name: "two" },
      ])
    await seedPaste({ slug: "a", owner: "owner", collection: "one" })
  })

  test("deletes every selected collection and brings them back with their pastes", async () => {
    const snapshots = await deleteCollections(["one", "two", "missing"])
    expect(snapshots.map((snapshot) => snapshot.slug).sort()).toEqual(["one", "two"])
    expect((await getDb().select().from(collection)).length).toBe(0)
    expect((await pasteRow("a"))?.collection).toBeNull()

    expect(await restoreCollections(snapshots)).toEqual({ ok: true })
    expect((await getDb().select().from(collection)).length).toBe(2)
    expect((await pasteRow("a"))?.collection).toBe("one")
  })
})
