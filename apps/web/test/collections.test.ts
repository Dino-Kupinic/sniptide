import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { collection } from "@workspace/db/schema"
import {
  createCollection,
  deleteCollection,
  renameCollection,
  setCollectionIcon,
} from "@/lib/collections/actions"
import { collectionExists, getCollection, listCollections, slugify } from "@/lib/collections/store"
import { MAX_COLLECTIONS } from "@/lib/collections/types"
import { getDb } from "@/lib/db"
import { savePaste, setPasteCollection } from "@/lib/pastes/actions"
import { listOwnPastes } from "@/lib/pastes/store"
import { hasDatabase, pasteRow, resetDatabase, seedPaste, seedUser, signInAs } from "./harness"

// Collections group one account's pastes. Nobody starts with any, they belong to their owner
// alone, and deleting one never deletes the pastes in it.

const describeDb = hasDatabase ? describe : describe.skip

const names = async () => (await listCollections()).map((c) => c.name)

const paste = (collection: string | null) => ({
  title: "A paste",
  description: "",
  files: [{ name: "a.txt", content: "hello" }],
  visibility: "unlisted" as const,
  expiry: "never" as const,
  slug: "",
  collection,
  password: null,
  burnAfterRead: false,
})

test("names become links", () => {
  expect(slugify("API snippets")).toBe("api-snippets")
  expect(slugify("  --Dot_files!! ")).toBe("dot-files")
  expect(slugify("Café déjà vu")).toBe("cafe-deja-vu")
  expect(slugify("🔥")).toBe("collection")
  expect(slugify("x".repeat(80))).toHaveLength(40)
})

describeDb("collections", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("ada")
    await seedUser("bob")
    signInAs("ada")
  })

  test("a new account has none", async () => {
    expect(await listCollections()).toEqual([])
    signInAs(null)
    expect(await listCollections()).toEqual([])
  })

  test("creating one gives it a link, and names can't repeat", async () => {
    expect(await createCollection("API snippets")).toEqual({ ok: true, slug: "api-snippets" })
    expect((await createCollection("api SNIPPETS")).ok).toBe(false)
    expect(await names()).toEqual(["API snippets"])

    // Different names that make the same link get a numbered one.
    expect(await createCollection("api-snippets")).toEqual({ ok: true, slug: "api-snippets-2" })
    expect(await createCollection("api_snippets")).toEqual({ ok: true, slug: "api-snippets-3" })
  })

  test("a name is required and limited in length", async () => {
    expect((await createCollection("   ")).ok).toBe(false)
    expect((await createCollection("x".repeat(41))).ok).toBe(false)
    expect(await listCollections()).toEqual([])
  })

  test("there is a limit per account", async () => {
    await getDb()
      .insert(collection)
      .values(
        Array.from({ length: MAX_COLLECTIONS }, (_, i) => ({
          ownerId: "ada",
          slug: `c${i}`,
          name: `c${i}`,
        })),
      )
    expect((await createCollection("one more")).ok).toBe(false)
    signInAs("bob")
    expect((await createCollection("one more")).ok).toBe(true)
  })

  test("accounts only see their own, and can reuse each other's names", async () => {
    await createCollection("notes")
    signInAs("bob")
    expect(await listCollections()).toEqual([])
    expect(await getCollection("notes")).toBeNull()
    expect(await collectionExists("notes")).toBe(false)
    expect(await createCollection("notes")).toEqual({ ok: true, slug: "notes" })
  })

  test("renaming changes the name and keeps the link", async () => {
    await createCollection("notes")
    expect(await renameCollection("notes", "Meeting notes")).toEqual({ ok: true, slug: "notes" })
    expect((await getCollection("notes"))?.name).toBe("Meeting notes")

    await createCollection("todo")
    expect((await renameCollection("todo", "meeting NOTES")).ok).toBe(false)
    // Keeping a name's own spelling, or changing only its case, is fine.
    expect((await renameCollection("todo", "TODO")).ok).toBe(true)
  })

  test("another account cannot rename or delete it", async () => {
    await createCollection("notes")
    await seedPaste({ slug: "p1", owner: "ada", collection: "notes" })
    signInAs("bob")
    expect((await renameCollection("notes", "mine now")).ok).toBe(false)
    await deleteCollection("notes")

    signInAs("ada")
    expect(await names()).toEqual(["notes"])
    expect((await pasteRow("p1"))?.collection).toBe("notes")
  })

  test("counts the live pastes in it, not the trash", async () => {
    await createCollection("notes")
    await seedPaste({ slug: "a", owner: "ada", collection: "notes" })
    await seedPaste({ slug: "b", owner: "ada", collection: "notes" })
    await seedPaste({ slug: "gone", owner: "ada", collection: "notes", deletedAt: new Date() })
    await seedPaste({ slug: "loose", owner: "ada" })

    expect((await getCollection("notes"))?.pasteCount).toBe(2)
  })

  test("deleting keeps the pastes, trashed ones too, and only its own", async () => {
    await createCollection("notes")
    await createCollection("other")
    await seedPaste({ slug: "a", owner: "ada", collection: "notes" })
    await seedPaste({ slug: "gone", owner: "ada", collection: "notes", deletedAt: new Date() })
    await seedPaste({ slug: "keep", owner: "ada", collection: "other" })
    // Bob's paste happens to use the same slug for a collection of his own.
    await seedPaste({ slug: "bobs", owner: "bob", collection: "notes" })

    await deleteCollection("notes")

    expect(await names()).toEqual(["other"])
    expect((await pasteRow("a"))?.collection).toBeNull()
    expect((await pasteRow("gone"))?.collection).toBeNull()
    expect((await pasteRow("keep"))?.collection).toBe("other")
    expect((await pasteRow("bobs"))?.collection).toBe("notes")
    expect((await listOwnPastes()).map((p) => p.slug).sort()).toEqual(["a", "keep"])
  })

  test("a paste can only be filed in one of the owner's collections", async () => {
    await createCollection("notes")

    const filed = await savePaste(paste("notes"))
    expect(filed.ok).toBe(true)
    if (filed.ok) expect((await pasteRow(filed.slug))?.collection).toBe("notes")

    expect((await savePaste(paste("nope"))).ok).toBe(false)
    // The old hard-coded names are no longer accepted either.
    expect((await savePaste(paste("api-snippets"))).ok).toBe(false)

    signInAs("bob")
    expect((await savePaste(paste("notes"))).ok).toBe(false)
    expect((await savePaste(paste(null))).ok).toBe(true)
  })

  test("new ones start as a square, each in the next hue", async () => {
    await createCollection("one")
    await createCollection("two")
    const [one, two] = await listCollections()
    expect(one).toMatchObject({ icon: "square", hue: "blue" })
    expect(two).toMatchObject({ icon: "square", hue: "sky" })
  })

  test("the icon and hue can be changed, only to known ones, and only by the owner", async () => {
    await createCollection("notes")
    await setCollectionIcon("notes", "grid", "teal")
    expect(await getCollection("notes")).toMatchObject({ icon: "grid", hue: "teal" })

    await expect(setCollectionIcon("notes", "<svg>", "teal")).rejects.toThrow()
    await expect(setCollectionIcon("notes", "grid", "#ff0000")).rejects.toThrow()

    signInAs("bob")
    await setCollectionIcon("notes", "corner", "red")
    signInAs("ada")
    expect(await getCollection("notes")).toMatchObject({ icon: "grid", hue: "teal" })
  })

  test("a paste can be filed and unfiled from the sidebar", async () => {
    await createCollection("notes")
    await seedPaste({ slug: "p1", owner: "ada" })

    expect((await setPasteCollection("p1", "notes")).ok).toBe(true)
    expect((await pasteRow("p1"))?.collection).toBe("notes")
    expect((await setPasteCollection("p1", "nope")).ok).toBe(false)
    expect((await pasteRow("p1"))?.collection).toBe("notes")
    expect((await setPasteCollection("p1", null)).ok).toBe(true)
    expect((await pasteRow("p1"))?.collection).toBeNull()

    // Someone else's paste stays where it is, even in a collection of the same name.
    await seedPaste({ slug: "bobs", owner: "bob" })
    await setPasteCollection("bobs", "notes")
    expect((await pasteRow("bobs"))?.collection).toBeNull()
  })
})
