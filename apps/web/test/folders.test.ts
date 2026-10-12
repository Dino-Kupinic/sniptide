import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { folder, paste, user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { getDb } from "@/lib/db"
import {
  createFolder,
  deleteFolder,
  moveFolder,
  movePastes,
  renameFolder,
} from "@/lib/folders/actions"
import { folderExists, listFolders } from "@/lib/folders/store"
import {
  buildTree,
  checkMove,
  depthOf,
  descendantIds,
  flattenTree,
  folderPath,
  heightOf,
  subtreePasteCount,
  uniqueName,
} from "@/lib/folders/tree"
import { type Folder, MAX_FOLDER_DEPTH, MAX_FOLDERS } from "@/lib/folders/types"
import { restorePaste, setShareAccess, trashPaste } from "@/lib/pastes/actions"
import { parsePasteListQuery } from "@/lib/pastes/list-query"
import { listPastePage } from "@/lib/pastes/lists"
import { getPaste, listOwnPastes } from "@/lib/pastes/store"
import { hasDatabase, pasteRow, resetDatabase, seedPaste, seedUser, signInAs } from "./harness"

// Folders arrange one account's pastes in a tree. Nobody starts with any, they belong to their
// owner alone, and deleting one never deletes a paste: they move up or go to the trash.

const describeDb = hasDatabase ? describe : describe.skip

const f = (id: string, parentId: string | null, name = id): Folder => ({
  id,
  parentId,
  name,
  pasteCount: 0,
})

test("the tree helpers walk parent links", () => {
  const folders = [f("a", null), f("b", "a"), f("c", "b"), f("d", "a"), f("e", null)]
  expect(descendantIds(folders, "a").sort()).toEqual(["b", "c", "d"])
  expect(descendantIds(folders, "c")).toEqual([])
  expect(folderPath(folders, "c").map((x) => x.id)).toEqual(["a", "b", "c"])
  expect(folderPath(folders, "nope")).toEqual([])
  expect(depthOf(folders, null)).toBe(0)
  expect(depthOf(folders, "c")).toBe(3)
  expect(heightOf(folders, "a")).toBe(3)
  expect(heightOf(folders, "e")).toBe(1)
  expect(buildTree(folders).map((x) => [x.id, x.children.map((y) => y.id)])).toEqual([
    ["a", ["b", "d"]],
    ["e", []],
  ])
})

test("pickers list folders in tree order, and counts add up the subtree", () => {
  const folders = [
    { ...f("b", null, "Beta"), pasteCount: 1 },
    { ...f("a", null, "Alpha"), pasteCount: 2 },
    { ...f("a1", "a", "Inner"), pasteCount: 4 },
  ]
  expect(flattenTree(folders).map((o) => [o.folder.id, o.depth])).toEqual([
    ["a", 0],
    ["a1", 1],
    ["b", 0],
  ])
  expect(subtreePasteCount(folders, "a")).toBe(6)
  expect(subtreePasteCount(folders, "b")).toBe(1)
})

test("a move is checked the same way the store does", () => {
  const folders = [f("a", null, "A"), f("b", "a", "B"), f("c", null, "C"), f("d", "c", "B")]
  expect(checkMove(folders, "b", "a")).toBe("same")
  expect(checkMove(folders, "a", "b")).toBe("cycle")
  expect(checkMove(folders, "a", "a")).toBe("cycle")
  expect(checkMove(folders, "b", "c")).toBe("duplicate")
  expect(checkMove(folders, "b", null)).toBe("ok")
  expect(checkMove(folders, "c", "a")).toBe("ok")
  let deep = [f("l1", null)]
  for (let level = 2; level <= MAX_FOLDER_DEPTH; level++)
    deep = [...deep, f(`l${level}`, `l${level - 1}`)]
  deep.push(f("x", null), f("y", "x"))
  expect(checkMove(deep, "x", `l${MAX_FOLDER_DEPTH}`)).toBe("depth")
})

test("a cycle in the data doesn't hang the path lookup", () => {
  expect(folderPath([f("a", "b"), f("b", "a")], "a")).toEqual([])
})

test("a clashing name gets the next free number", () => {
  expect(uniqueName("Notes", ["Other"], 60)).toBe("Notes")
  expect(uniqueName("Notes", ["notes"], 60)).toBe("Notes (2)")
  expect(uniqueName("Notes", ["Notes", "Notes (2)"], 60)).toBe("Notes (3)")
  expect(uniqueName("x".repeat(60), ["x".repeat(60)], 60)).toHaveLength(60)
})

describeDb("folders", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("ada")
    await seedUser("bob")
    signInAs("ada")
  })

  // Creates a folder that must succeed and returns its id.
  async function make(name: string, parentId: string | null = null) {
    const result = await createFolder(name, parentId)
    if (!result.ok) throw new Error(result.error)
    return result.id
  }
  const removeRow = async (id: string) => {
    await getDb().delete(folder).where(eq(folder.id, id))
  }
  const names = async () => (await listFolders()).map((x) => x.name)
  const slugsIn = async (folderId: string | null) =>
    (await listOwnPastes())
      .filter((p) => p.folderId === folderId)
      .map((p) => p.slug)
      .sort()

  test("a new account has none, and signed out sees none", async () => {
    expect(await listFolders()).toEqual([])
    signInAs(null)
    expect(await listFolders()).toEqual([])
    await expect(createFolder("Nope")).rejects.toThrow("Sign in")
  })

  test("folders nest, and only siblings can't share a name", async () => {
    const work = await make("Work")
    const home = await make("Home")
    const workNotes = await make("Notes", work)
    const homeNotes = await make("Notes", home)
    expect(new Set([workNotes, homeNotes]).size).toBe(2)

    expect((await createFolder("notes", work)).ok).toBe(false)
    expect((await createFolder("WORK")).ok).toBe(false)
    expect((await createFolder("Work", work)).ok).toBe(true)
    expect(await listFolders()).toHaveLength(5)
    expect((await listFolders()).find((x) => x.id === workNotes)?.parentId).toBe(work)
  })

  test("a name is required and limited in length", async () => {
    expect((await createFolder("   ")).ok).toBe(false)
    expect((await createFolder("x".repeat(61))).ok).toBe(false)
    expect((await createFolder("  Spaced  ")).ok).toBe(true)
    expect(await names()).toEqual(["Spaced"])
  })

  test("a parent that doesn't exist, or isn't yours, is refused", async () => {
    expect((await createFolder("Orphan", crypto.randomUUID())).ok).toBe(false)
    expect((await createFolder("Orphan", "not-an-id")).ok).toBe(false)
    const mine = await make("Mine")
    signInAs("bob")
    expect((await createFolder("Sneaky", mine)).ok).toBe(false)
    expect(await listFolders()).toEqual([])
  })

  test("nesting stops at the depth limit", async () => {
    let parent: string | null = null
    for (let level = 1; level <= MAX_FOLDER_DEPTH; level++) parent = await make(`L${level}`, parent)
    expect((await createFolder("too deep", parent)).ok).toBe(false)
    expect((await createFolder("sibling at the limit", await make("Top"))).ok).toBe(true)
  })

  test("there is a limit per account", async () => {
    await getDb()
      .insert(folder)
      .values(Array.from({ length: MAX_FOLDERS }, (_, i) => ({ ownerId: "ada", name: `f${i}` })))
    expect((await createFolder("one more")).ok).toBe(false)
    signInAs("bob")
    expect((await createFolder("one more")).ok).toBe(true)
  })

  test("renaming keeps the place in the tree and the sibling rule", async () => {
    const work = await make("Work")
    const notes = await make("Notes", work)
    await make("Ideas", work)
    expect((await renameFolder(notes, "ideas")).ok).toBe(false)
    expect((await renameFolder(notes, "  Plans ")).ok).toBe(true)
    // Changing only the case of its own name is allowed.
    expect((await renameFolder(notes, "PLANS")).ok).toBe(true)
    const renamed = (await listFolders()).find((x) => x.id === notes)
    expect(renamed).toMatchObject({ name: "PLANS", parentId: work })
    expect((await renameFolder(notes, "")).ok).toBe(false)
    expect((await renameFolder(crypto.randomUUID(), "Gone")).ok).toBe(false)
  })

  test("folders are private to their owner", async () => {
    const mine = await make("Mine")
    signInAs("bob")
    expect(await listFolders()).toEqual([])
    expect(await folderExists(mine)).toBe(false)
    expect((await renameFolder(mine, "Taken")).ok).toBe(false)
    expect((await moveFolder(mine, null)).ok).toBe(false)
    expect(await deleteFolder(mine, "move")).toEqual({ ok: false, error: expect.any(String) })
    signInAs("ada")
    expect(await names()).toEqual(["Mine"])
  })

  test("a folder moves with everything below it", async () => {
    const a = await make("A")
    const b = await make("B", a)
    const c = await make("C", b)
    const other = await make("Other")
    expect((await moveFolder(b, other)).ok).toBe(true)
    const all = await listFolders()
    expect(all.find((x) => x.id === b)?.parentId).toBe(other)
    expect(all.find((x) => x.id === c)?.parentId).toBe(b)
    expect((await moveFolder(b, null)).ok).toBe(true)
    expect((await listFolders()).find((x) => x.id === b)?.parentId).toBeNull()
  })

  test("a folder can't go inside itself or its own subfolder", async () => {
    const a = await make("A")
    const b = await make("B", a)
    const c = await make("C", b)
    expect(await moveFolder(a, a)).toEqual({ ok: false, error: expect.any(String) })
    expect((await moveFolder(a, c)).ok).toBe(false)
    expect((await moveFolder(b, c)).ok).toBe(false)
    const parents = (await listFolders()).map((x) => [x.name, x.parentId])
    expect(parents).toEqual([
      ["A", null],
      ["B", a],
      ["C", b],
    ])
  })

  test("a move can't clash with a name or exceed the depth limit", async () => {
    const a = await make("A")
    const dup = await make("Same", a)
    const top = await make("Same")
    expect((await moveFolder(top, a)).ok).toBe(false)
    expect((await moveFolder(dup, null)).ok).toBe(false)

    let deep: string | null = null
    for (let level = 1; level < MAX_FOLDER_DEPTH; level++) deep = await make(`D${level}`, deep)
    const twoLevels = await make("T1")
    await make("T2", twoLevels)
    // Under the deepest-but-one folder, T1 and T2 would reach one level too far.
    expect((await moveFolder(twoLevels, deep)).ok).toBe(false)
    const leaf = await make("Leaf")
    expect((await moveFolder(leaf, deep)).ok).toBe(true)
  })

  describe("moving pastes", () => {
    test("pastes move into a folder, between folders, and back out", async () => {
      const work = await make("Work")
      const notes = await make("Notes", work)
      await seedPaste({ slug: "one", owner: "ada" })
      await seedPaste({ slug: "two", owner: "ada" })

      expect(await movePastes(["one", "two"], work)).toEqual({ ok: true, moved: 2 })
      expect(await slugsIn(work)).toEqual(["one", "two"])
      expect(await movePastes(["two"], notes)).toEqual({ ok: true, moved: 1 })
      expect(await slugsIn(work)).toEqual(["one"])
      expect(await slugsIn(notes)).toEqual(["two"])
      expect(await movePastes(["one", "two"], null)).toEqual({ ok: true, moved: 2 })
      expect(await slugsIn(null)).toEqual(["one", "two"])
    })

    test("a move leaves the paste's order and times alone", async () => {
      const work = await make("Work")
      await seedPaste({ slug: "one", owner: "ada" })
      const before = await pasteRow("one")
      await movePastes(["one"], work)
      expect((await pasteRow("one"))?.updatedAt).toEqual(before?.updatedAt as Date)
    })

    test("only the viewer's own live pastes move", async () => {
      const mine = await make("Mine")
      await seedPaste({ slug: "own", owner: "ada" })
      await seedPaste({ slug: "bobs", owner: "bob" })
      await seedPaste({ slug: "bin", owner: "ada", deletedAt: new Date() })
      expect(await movePastes(["own", "bobs", "bin", "nothing"], mine)).toEqual({
        ok: true,
        moved: 1,
      })
      expect((await pasteRow("bobs"))?.folderId).toBeNull()
      expect((await pasteRow("bin"))?.folderId).toBeNull()
      expect(await movePastes([], mine)).toEqual({ ok: true, moved: 0 })
    })

    test("a folder that is gone, or someone else's, isn't a destination", async () => {
      await seedPaste({ slug: "own", owner: "ada" })
      const mine = await make("Mine")
      expect((await movePastes(["own"], crypto.randomUUID())).ok).toBe(false)
      signInAs("bob")
      await seedPaste({ slug: "bobs", owner: "bob" })
      expect((await movePastes(["bobs"], mine)).ok).toBe(false)
      expect((await pasteRow("bobs"))?.folderId).toBeNull()
    })

    test("bad input is refused before it touches anything", async () => {
      await seedPaste({ slug: "own", owner: "ada" })
      expect((await movePastes(["x"], null)).ok).toBe(false)
      expect((await movePastes(["own"], "not-an-id")).ok).toBe(false)
      const many = Array.from({ length: 101 }, (_, i) => `paste-${i}`)
      expect((await movePastes(many, null)).ok).toBe(false)
    })

    test("only the owner sees which folder a paste is in", async () => {
      const mine = await make("Mine")
      await seedPaste({ slug: "own", owner: "ada" })
      await movePastes(["own"], mine)
      expect((await getPaste("own"))?.folderId).toBe(mine)
      expect((await setShareAccess("own", "bob", "view")).ok).toBe(true)
      signInAs("bob")
      expect((await getPaste("own"))?.slug).toBe("own")
      expect((await getPaste("own"))?.folderId).toBeNull()
    })

    test("a folder's pastes can be listed, without those of other folders or the trash", async () => {
      const work = await make("Work")
      const home = await make("Home")
      await seedPaste({ slug: "w1", owner: "ada", folderId: work })
      await seedPaste({ slug: "w2", owner: "ada", folderId: work })
      await seedPaste({ slug: "w-bin", owner: "ada", folderId: work, deletedAt: new Date() })
      await seedPaste({ slug: "h1", owner: "ada", folderId: home })
      await seedPaste({ slug: "loose", owner: "ada" })

      const page = await listPastePage({ mode: "folder", folder: work }, parsePasteListQuery({}))
      expect(page.pastes.map((p) => p.slug).sort()).toEqual(["w1", "w2"])
      expect((await listFolders()).find((x) => x.id === work)?.pasteCount).toBe(2)

      signInAs("bob")
      const others = await listPastePage({ mode: "folder", folder: work }, parsePasteListQuery({}))
      expect(others.pastes).toEqual([])
      const junk = await listPastePage({ mode: "folder", folder: "nope" }, parsePasteListQuery({}))
      expect(junk.pastes).toEqual([])
    })
  })

  describe("deleting a folder", () => {
    // work > (notes > deep), home. Pastes sit at every level, one of them in the trash.
    async function seedTree() {
      const work = await make("Work")
      const notes = await make("Notes", work)
      const deep = await make("Deep", notes)
      const home = await make("Home")
      await seedPaste({ slug: "in-work", owner: "ada", folderId: work })
      await seedPaste({ slug: "in-notes", owner: "ada", folderId: notes })
      await seedPaste({ slug: "in-deep", owner: "ada", folderId: deep })
      await seedPaste({ slug: "in-bin", owner: "ada", folderId: notes, deletedAt: new Date() })
      await seedPaste({ slug: "in-home", owner: "ada", folderId: home })
      return { work, notes, deep, home }
    }
    const allSlugs = async () =>
      (await getDb().select({ slug: paste.slug }).from(paste)).map((p) => p.slug).sort()

    test("it has to say what happens to the contents", async () => {
      const { notes } = await seedTree()
      // @ts-expect-error the second argument is required
      expect(await deleteFolder(notes)).toEqual({ ok: false, error: expect.any(String) })
      // @ts-expect-error only the listed choices
      expect((await deleteFolder(notes, "everything")).ok).toBe(false)
      expect(await listFolders()).toHaveLength(4)
    })

    test("move: subfolders and pastes go up one level, the trash's included", async () => {
      const { work, notes, deep } = await seedTree()
      const before = await allSlugs()

      expect(await deleteFolder(notes, "move")).toEqual({ ok: true, folders: 1, pastes: 1 })

      expect((await listFolders()).find((x) => x.id === notes)).toBeUndefined()
      expect((await listFolders()).find((x) => x.id === deep)?.parentId).toBe(work)
      expect((await pasteRow("in-notes"))?.folderId).toBe(work)
      expect((await pasteRow("in-bin"))?.folderId).toBe(work)
      expect((await pasteRow("in-bin"))?.deletedAt).not.toBeNull()
      expect((await pasteRow("in-deep"))?.folderId).toBe(deep)
      expect(await allSlugs()).toEqual(before)
    })

    test("move: a top-level folder's contents land at the top level", async () => {
      const { work, notes } = await seedTree()
      expect(await deleteFolder(work, "move")).toEqual({ ok: true, folders: 1, pastes: 1 })
      expect((await listFolders()).find((x) => x.id === notes)?.parentId).toBeNull()
      expect((await pasteRow("in-work"))?.folderId).toBeNull()
    })

    test("move: a subfolder whose name is taken above is renamed, not lost", async () => {
      const work = await make("Work")
      await make("Notes", work)
      const mid = await make("Mid", work)
      const clash = await make("notes", mid)
      expect(await deleteFolder(mid, "move")).toEqual({ ok: true, folders: 1, pastes: 0 })
      const moved = (await listFolders()).find((x) => x.id === clash)
      expect(moved).toMatchObject({ name: "notes (2)", parentId: work })
    })

    test("trash: the pastes below go to the trash and the folders are gone", async () => {
      const { work, home } = await seedTree()
      const before = await allSlugs()

      expect(await deleteFolder(work, "trash")).toEqual({ ok: true, folders: 3, pastes: 3 })

      expect((await listFolders()).map((x) => x.id)).toEqual([home])
      for (const slug of ["in-work", "in-notes", "in-deep", "in-bin"]) {
        const row = await pasteRow(slug)
        expect(row?.deletedAt).not.toBeNull()
        expect(row?.folderId).toBeNull()
      }
      expect((await pasteRow("in-home"))?.deletedAt).toBeNull()
      expect(await allSlugs()).toEqual(before)
    })

    test("trash: a trashed paste restores at the top level", async () => {
      const { work } = await seedTree()
      await deleteFolder(work, "trash")
      await restorePaste("in-deep")
      const row = await pasteRow("in-deep")
      expect(row?.deletedAt).toBeNull()
      expect(row?.folderId).toBeNull()
    })

    test("trash: pastes already in the trash keep their original deletion time", async () => {
      const { work } = await seedTree()
      const before = (await pasteRow("in-bin"))?.deletedAt
      await deleteFolder(work, "trash")
      expect((await pasteRow("in-bin"))?.deletedAt).toEqual(before as Date)
    })

    test("an empty folder just goes", async () => {
      const lone = await make("Lone")
      expect(await deleteFolder(lone, "move")).toEqual({ ok: true, folders: 1, pastes: 0 })
      expect(await deleteFolder(lone, "move")).toEqual({ ok: false, error: expect.any(String) })
    })

    test("another account's pastes and folders are untouched", async () => {
      const { work } = await seedTree()
      signInAs("bob")
      const bobs = await make("Bobs")
      await seedPaste({ slug: "bobs-paste", owner: "bob", folderId: bobs })
      signInAs("ada")
      await deleteFolder(work, "trash")
      expect((await pasteRow("bobs-paste"))?.deletedAt).toBeNull()
      expect((await pasteRow("bobs-paste"))?.folderId).toBe(bobs)
    })

    test("the database itself refuses to drop a folder that still holds pastes or folders", async () => {
      const { notes, work } = await seedTree()
      // Notes holds pastes, and Work holds Notes.
      await expect(removeRow(notes)).rejects.toThrow()
      await expect(removeRow(work)).rejects.toThrow()
      expect(await listFolders()).toHaveLength(4)
    })

    test("trashing a paste keeps its folder, so restoring puts it back", async () => {
      const work = await make("Work")
      await seedPaste({ slug: "keep", owner: "ada", folderId: work })
      await trashPaste("keep")
      await restorePaste("keep")
      expect((await pasteRow("keep"))?.folderId).toBe(work)
    })

    test("deleting an account removes its folders and pastes together", async () => {
      const { work } = await seedTree()
      expect(work).toBeTruthy()
      await getDb().delete(user).where(eq(user.id, "ada"))
      expect(await getDb().select().from(folder)).toEqual([])
      expect(await allSlugs()).toEqual([])
    })
  })
})
