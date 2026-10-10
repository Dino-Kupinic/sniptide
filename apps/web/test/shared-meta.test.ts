import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { readSharedMeta } from "@/lib/pastes/store"
import {
  hasDatabase,
  pasteRow,
  resetDatabase,
  seedPaste,
  seedUser,
  signInAs,
  unlock,
} from "./harness"

// The share page's metadata must not leak a title the visitor couldn't read, and must not count
// or burn anything.
const describeDb = hasDatabase ? describe : describe.skip

describeDb("share page metadata", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
    await seedUser("visitor")
    signInAs("visitor")
  })

  test("returns the title and visibility of an openable paste", async () => {
    await seedPaste({ slug: "open", owner: "owner", visibility: "public" })
    expect(await readSharedMeta("open")).toEqual({ title: "title-of-open", visibility: "public" })
    expect((await pasteRow("open"))?.views).toBe(0)
  })

  test("hides private, locked and burn-after-read titles", async () => {
    await seedPaste({ slug: "priv", owner: "owner", visibility: "private" })
    await seedPaste({ slug: "lock", owner: "owner", password: "hunter22" })
    await seedPaste({ slug: "burn", owner: "owner", burnAfterRead: true })

    expect(await readSharedMeta("priv")).toBeNull()
    expect(await readSharedMeta("lock")).toBeNull()
    expect(await readSharedMeta("burn")).toBeNull()
    expect(await readSharedMeta("nope")).toBeNull()
    expect((await pasteRow("burn"))?.deletedAt).toBeNull()

    await unlock("lock")
    expect(await readSharedMeta("lock")).toEqual({ title: "title-of-lock", visibility: "unlisted" })
  })

  test("the owner sees their private paste's title", async () => {
    await seedPaste({ slug: "mine", owner: "owner", visibility: "private" })
    signInAs("owner")
    expect(await readSharedMeta("mine")).toEqual({ title: "title-of-mine", visibility: "private" })
  })
})
