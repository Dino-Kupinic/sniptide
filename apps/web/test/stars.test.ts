import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { paste } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { listStarred, navCounts, setStarred } from "@/lib/pastes/store"
import {
  hasDatabase,
  resetDatabase,
  seedPaste,
  seedUser,
  signInAs,
  starCount,
  unlock,
} from "./harness"

// A star lists the paste's title, slug and owner on the starrer's page, so it must never be a way
// to learn about a paste the starrer can't open.

const describeDb = hasDatabase ? describe : describe.skip

const titles = async () => (await listStarred()).map((starred) => starred.title)

describeDb("starring", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
    await seedUser("other")
    await seedPaste({ slug: "pub", owner: "owner", visibility: "public" })
    await seedPaste({ slug: "unl", owner: "owner", visibility: "unlisted" })
    await seedPaste({ slug: "priv", owner: "owner", visibility: "private" })
    await seedPaste({ slug: "pw", owner: "owner", password: "hunter22" })
    await seedPaste({
      slug: "old",
      owner: "owner",
      visibility: "public",
      expiresAt: new Date(Date.now() - 1000),
    })
    await seedPaste({ slug: "bin", owner: "owner", visibility: "public", deletedAt: new Date() })
  })

  test("another account cannot star a private, locked, expired or trashed paste", async () => {
    signInAs("other")
    for (const slug of ["priv", "pw", "old", "bin", "nope"]) await setStarred(slug, true)

    expect(await starCount()).toBe(0)
    expect(await titles()).toEqual([])
    expect((await navCounts()).starred).toBe(0)
  })

  test("another account can star a public or unlisted paste", async () => {
    signInAs("other")
    await setStarred("pub", true)
    await setStarred("unl", true)

    expect((await titles()).sort()).toEqual(["title-of-pub", "title-of-unl"])
    expect((await navCounts()).starred).toBe(2)
  })

  test("a password paste can be starred once it is unlocked, and drops out of the list if not", async () => {
    signInAs("other")
    await unlock("pw")
    await setStarred("pw", true)
    expect(await titles()).toEqual(["title-of-pw"])

    // Without the unlock cookie (a new session, or the password changed) it is hidden again.
    const { request } = await import("./request")
    request.cookies.clear()
    expect(await titles()).toEqual([])
    expect((await navCounts()).starred).toBe(0)
    expect(await starCount()).toBe(1)
  })

  test("a starred paste that later goes private, expires or is trashed leaves the list", async () => {
    signInAs("other")
    await setStarred("pub", true)
    await setStarred("unl", true)
    expect(await titles()).toHaveLength(2)

    const db = getDb()
    await db.update(paste).set({ visibility: "private" }).where(eq(paste.slug, "pub"))
    expect(await titles()).toEqual(["title-of-unl"])
    expect((await navCounts()).starred).toBe(1)

    await db
      .update(paste)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(paste.slug, "unl"))
    expect(await titles()).toEqual([])

    // The stars survive, so making the paste public again brings them back.
    await db.update(paste).set({ visibility: "public" }).where(eq(paste.slug, "pub"))
    expect(await titles()).toEqual(["title-of-pub"])
  })

  test("the owner can star their own private paste", async () => {
    signInAs("owner")
    await setStarred("priv", true)

    expect(await titles()).toEqual(["title-of-priv"])
    expect((await navCounts()).starred).toBe(1)
  })

  test("a star can always be taken off", async () => {
    signInAs("other")
    await setStarred("pub", true)
    await getDb().update(paste).set({ visibility: "private" }).where(eq(paste.slug, "pub"))
    await setStarred("pub", false)

    expect(await starCount()).toBe(0)
  })
})
