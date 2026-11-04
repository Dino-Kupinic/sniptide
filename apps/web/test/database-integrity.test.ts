import { afterAll, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { account, collection, paste, pasteFile, user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import * as collections from "@/lib/collections/store"
import { getDb } from "@/lib/db"
import * as actions from "@/lib/pastes/actions"
import { createPaste, setPasteCollection, updatePaste } from "@/lib/pastes/store"
import type { PasteInput } from "@/lib/pastes/types"
import { hasDatabase, resetDatabase, seedPaste, seedUser, signInAs } from "./harness"

const describeDb = hasDatabase ? describe : describe.skip
const input = (collection: string | null): PasteInput => ({
  title: "A paste",
  description: "",
  files: [{ name: "a.txt", language: "text", content: "kept content" }],
  visibility: "private",
  expiry: "never",
  slug: "",
  collection,
  password: null,
  burnAfterRead: false,
})

describeDb("database ownership integrity", () => {
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("ada")
    await seedUser("bob")
    signInAs("ada")
    await getDb().insert(collection).values({ ownerId: "bob", slug: "notes", name: "Notes" })
  })
  afterAll(resetDatabase)

  test("SQL cannot assign a missing collection or another owner's collection", async () => {
    for (const slug of ["missing", "notes"]) {
      await expect(
        getDb()
          .insert(paste)
          .values({
            ownerId: "ada",
            slug,
            title: "Invalid",
            visibility: "private",
            collection: slug,
          })
          .execute(),
      ).rejects.toThrow()
    }
    await getDb().insert(collection).values({ ownerId: "ada", slug: "notes", name: "Notes" })
    await seedPaste({ owner: "ada", slug: "valid", collection: "notes" })
    await expect(
      getDb().update(paste).set({ collection: "missing" }).where(eq(paste.slug, "valid")).execute(),
    ).rejects.toThrow()
  })

  test("direct browser persistence rejects missing collections without losing content", async () => {
    await expect(createPaste(input("notes"))).rejects.toThrow("collection doesn't exist")
    const saved = await createPaste(input(null))
    await expect(updatePaste(saved.slug, input("missing"), "Edit")).rejects.toThrow(
      "collection doesn't exist",
    )
    await expect(setPasteCollection(saved.slug, "missing")).rejects.toThrow(
      "collection doesn't exist",
    )
    const [record] = await getDb().select().from(paste).where(eq(paste.slug, saved.slug))
    expect(record?.collection).toBeNull()
    expect((await getDb().select().from(pasteFile))[0]?.content).toBe("kept content")
  })

  for (const operation of ["save", "autosave", "move", "bulk move"] as const) {
    test(`${operation} reports a collection deleted after the browser's existence check`, async () => {
      await getDb().insert(collection).values({ ownerId: "ada", slug: "notes", name: "Notes" })
      const saved = await createPaste(input(null))
      const [record] = await getDb().select().from(paste).where(eq(paste.slug, saved.slug))
      if (!record) throw new Error("Missing paste")
      const original = collections.collectionExists
      const check = spyOn(collections, "collectionExists").mockImplementation(async (slug) => {
        const exists = await original(slug)
        await collections.deleteCollection(slug)
        return exists
      })
      try {
        const result =
          operation === "save"
            ? await actions.savePaste(input("notes"))
            : operation === "autosave"
              ? await actions.autosavePaste(saved.slug, input("notes"), record.version)
              : operation === "move"
                ? await actions.setPasteCollection(saved.slug, "notes")
                : await actions.setPastesCollection([saved.slug], "notes")
        expect(result).toMatchObject({ ok: false, error: expect.any(String) })
        expect(await getDb().select().from(paste)).toHaveLength(1)
        expect((await getDb().select().from(pasteFile))[0]?.content).toBe("kept content")
      } finally {
        check.mockRestore()
      }
    })
  }

  test("collection deletion waits for a writer and unfiles its committed paste", async () => {
    await getDb().insert(collection).values({ ownerId: "ada", slug: "notes", name: "Notes" })
    const locked = Promise.withResolvers<number>()
    const release = Promise.withResolvers<void>()
    const writing = getDb().transaction(async (tx) => {
      await tx.select({ id: user.id }).from(user).where(eq(user.id, "ada")).for("no key update")
      const [backend] = await tx.execute<{ pid: number }>("select pg_backend_pid() AS pid")
      if (!backend) throw new Error("Missing database backend")
      locked.resolve(backend.pid)
      await release.promise
      await tx.insert(paste).values({
        ownerId: "ada",
        slug: "in-flight",
        title: "In flight",
        visibility: "private",
        collection: "notes",
        version: 10,
      })
    })
    const pid = await locked.promise
    const deleting = collections.deleteCollection("notes")
    try {
      let blocked = false
      for (let attempt = 0; attempt < 100 && !blocked; attempt++) {
        const [row] = await getDb()
          .$client`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid))) AS blocked`
        blocked = row?.blocked === true
        if (!blocked) await Bun.sleep(10)
      }
      expect(blocked).toBe(true)
    } finally {
      release.resolve()
      await writing
      await deleting
    }
    const [record] = await getDb().select().from(paste).where(eq(paste.slug, "in-flight"))
    expect(record).toMatchObject({ collection: null, version: 11 })
  })

  test("provider identities are unique across accounts but scoped to the provider", async () => {
    const identity = { providerId: "github", accountId: "provider-user", userId: "ada" }
    await getDb()
      .insert(account)
      .values({ id: "original", ...identity })
    for (const userId of ["ada", "bob"]) {
      await expect(
        getDb()
          .insert(account)
          .values({ id: `duplicate-${userId}`, ...identity, userId })
          .execute(),
      ).rejects.toThrow()
    }
    await getDb()
      .insert(account)
      .values({ id: "other-provider", ...identity, providerId: "google", userId: "bob" })
    await getDb()
      .insert(account)
      .values({ id: "other-identity", ...identity, accountId: "another-user", userId: "bob" })
    expect(await getDb().select().from(account)).toHaveLength(3)
  })

  test("concurrent inserts cannot claim the same provider identity", async () => {
    const results = await Promise.allSettled(
      ["ada", "bob"].map((userId) =>
        getDb()
          .insert(account)
          .values({ id: `race-${userId}`, providerId: "github", accountId: "same-user", userId }),
      ),
    )
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    expect(await getDb().select().from(account)).toHaveLength(1)
  })
})
