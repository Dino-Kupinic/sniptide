import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { removeShare, restoreRemovedShare, restoreShare as undoLeave } from "@/lib/pastes/actions"
import { toSharedRows } from "@/lib/pastes/rows"
import {
  createPaste,
  findPerson,
  getPaste,
  getPasteMeta,
  getShare,
  leaveShare,
  listPasteShares,
  listShared,
  listStarred,
  markShareSeen,
  navCounts,
  readRawFile,
  readSharedPaste,
  setStarred,
  sharePaste,
  trashPaste,
  unsharePaste,
  updatePaste,
} from "@/lib/pastes/store"
import type { PasteInput } from "@/lib/pastes/types"
import { hasDatabase, marker, resetDatabase, seedPaste, seedUser, signInAs } from "./harness"

// Sharing a paste with specific accounts (WRK-127) and the recipient's Shared with me (WRK-128):
// an invited person can open a private paste, everyone else still gets a 404, and taking access
// away (or leaving) closes it again.

const describeDb = hasDatabase ? describe : describe.skip

function edit(overrides: Partial<PasteInput> = {}): PasteInput {
  return {
    title: "edited",
    description: "",
    files: [{ name: "a.txt", language: "text", content: "changed" }],
    visibility: "public",
    expiry: "keep",
    slug: "",
    collection: "theirs",
    password: null,
    burnAfterRead: false,
    ...overrides,
  }
}

describeDb("sharing", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
    await seedUser("friend")
    await seedUser("stranger")
    await getDb().update(user).set({ username: "friend" }).where(eq(user.id, "friend"))
    await seedPaste({ slug: "priv", owner: "owner", visibility: "private", collection: "mine" })
  })

  async function share(slug: string, to: string, access: "view" | "edit" = "view") {
    signInAs("owner")
    expect(await sharePaste(slug, to, access)).toBe(true)
  }

  test("an invited person opens a private paste; anyone else still gets a 404", async () => {
    await share("priv", "friend")

    signInAs("friend")
    expect((await getPaste("priv"))?.files[0]?.content).toBe(marker("priv"))
    expect(await getPasteMeta("priv")).toEqual({ title: "title-of-priv" })
    const read = await readSharedPaste("priv")
    expect(read.status).toBe("ok")
    expect((await readRawFile("priv", null)).status).toBe("ok")

    for (const viewer of ["stranger", null]) {
      signInAs(viewer)
      expect(await getPaste("priv")).toBeNull()
      expect(await getPasteMeta("priv")).toBeNull()
      expect(await readSharedPaste("priv")).toEqual({ status: "missing" })
      expect(await readRawFile("priv", null)).toEqual({ status: "missing" })
    }
  })

  test("an invite skips the paste's password", async () => {
    await seedPaste({ slug: "pw", owner: "owner", visibility: "unlisted", password: "hunter22" })
    await share("pw", "friend")

    signInAs("friend")
    expect((await readSharedPaste("pw")).status).toBe("ok")
    signInAs("stranger")
    expect(await readSharedPaste("pw")).toEqual({ status: "locked" })
  })

  test("Shared with me lists new shares as unseen until opened, and counts them", async () => {
    await share("priv", "friend", "edit")

    signInAs("friend")
    const [entry] = await listShared()
    expect(entry?.paste.slug).toBe("priv")
    expect(entry?.paste.owner?.name).toBe("owner")
    expect(entry?.share).toMatchObject({ slug: "priv", access: "edit", seen: false })
    const [row] = await toSharedRows(await listShared())
    expect(row).toMatchObject({ unseen: true, canEdit: true, collection: null })
    expect((await navCounts()).shared).toBe(1)

    await markShareSeen("priv")
    expect((await getShare("priv"))?.seen).toBe(true)

    signInAs("stranger")
    expect(await listShared()).toEqual([])
    expect((await navCounts()).shared).toBe(0)
  })

  test("the owner sees who has access, can change it, and revoking closes the paste", async () => {
    await share("priv", "friend")
    signInAs("owner")
    expect((await listPasteShares("priv"))?.map((p) => [p.handle, p.access])).toEqual([
      ["@friend", "view"],
    ])
    await sharePaste("priv", "friend", "edit")
    expect((await listPasteShares("priv"))?.[0]?.access).toBe("edit")

    signInAs("friend")
    await setStarred("priv", true)
    expect(await listStarred()).toHaveLength(1)

    signInAs("owner")
    await unsharePaste("priv", "friend")
    expect(await listPasteShares("priv")).toEqual([])

    signInAs("friend")
    expect(await listShared()).toEqual([])
    expect(await getPaste("priv")).toBeNull()
    expect(await readSharedPaste("priv")).toEqual({ status: "missing" })
    expect(await listStarred()).toEqual([])
  })

  test("only the owner can share or see who it's shared with", async () => {
    await share("priv", "friend", "edit")
    signInAs("friend")
    expect(await sharePaste("priv", "stranger", "view")).toBe(false)
    expect(await listPasteShares("priv")).toBeNull()
    await unsharePaste("priv", "friend")
    expect(await getShare("priv")).not.toBeNull()

    signInAs("owner")
    expect(await sharePaste("priv", "owner", "view")).toBe(false)
    expect(await sharePaste("priv", "nobody", "view")).toBe(false)
  })

  test("a recipient can leave, and the owner can invite them again", async () => {
    await share("priv", "friend")
    signInAs("friend")
    await leaveShare("priv")
    expect(await listShared()).toEqual([])
    expect(await getPaste("priv")).toBeNull()

    await share("priv", "friend")
    signInAs("friend")
    expect(await listShared()).toHaveLength(1)
  })

  test("leaving can be undone, and keeps the share as it was", async () => {
    await share("priv", "friend", "edit")
    signInAs("friend")
    await markShareSeen("priv")
    await setStarred("priv", true)

    await leaveShare("priv")
    expect(await getPaste("priv")).toBeNull()
    expect(await getShare("priv")).toBeNull()
    expect(await listStarred()).toEqual([])
    expect(await updatePaste("priv", edit(), "Edited")).toBeNull()
    expect((await navCounts()).shared).toBe(0)

    expect(await undoLeave("priv")).toEqual({ ok: true })
    expect((await getPaste("priv"))?.slug).toBe("priv")
    expect(await getShare("priv")).toMatchObject({ access: "edit", seen: true })
    expect(await listShared()).toHaveLength(1)
    expect((await listStarred()).map((row) => row.slug)).toEqual(["priv"])
    expect((await navCounts()).shared).toBe(1)
    // Undoing twice changes nothing more.
    expect(await undoLeave("priv")).toMatchObject({ ok: false })
  })

  test("someone who left is gone from the owner's list, and the undo can't outlive a revoke", async () => {
    await share("priv", "friend")
    signInAs("friend")
    await leaveShare("priv")

    signInAs("owner")
    expect(await listPasteShares("priv")).toEqual([])

    // The owner removes the person for good while the undo is still on screen.
    await unsharePaste("priv", "friend")
    signInAs("friend")
    expect(await undoLeave("priv")).toMatchObject({ ok: false })
    expect(await getPaste("priv")).toBeNull()
    expect(await listShared()).toEqual([])
  })

  test("inviting someone who left starts a fresh, unseen share", async () => {
    await share("priv", "friend")
    signInAs("friend")
    await markShareSeen("priv")
    await leaveShare("priv")

    await share("priv", "friend", "edit")
    signInAs("friend")
    expect(await getShare("priv")).toMatchObject({ access: "edit", seen: false })
    // Nothing left to undo.
    expect(await undoLeave("priv")).toMatchObject({ ok: false })
  })

  test("nobody can undo a leave they never made", async () => {
    await share("priv", "friend")
    signInAs("stranger")
    expect(await undoLeave("priv")).toMatchObject({ ok: false })
    expect(await getPaste("priv")).toBeNull()
    signInAs("friend")
    expect(await undoLeave("priv")).toMatchObject({ ok: false })
  })

  test("removing someone can be undone, in the same place in the list", async () => {
    await seedUser("second")
    await share("priv", "friend")
    await share("priv", "second", "edit")
    signInAs("owner")
    const before = await listPasteShares("priv")
    const friend = before?.find((person) => person.id === "friend")
    expect(before?.map((person) => person.id)).toEqual(["friend", "second"])
    if (!friend) throw new Error("friend missing")

    const removed = await removeShare("priv", "friend")
    expect(removed.ok && removed.people.map((person) => person.id)).toEqual(["second"])
    signInAs("friend")
    expect(await getPaste("priv")).toBeNull()

    signInAs("owner")
    const restored = await restoreRemovedShare("priv", "friend", friend.access, friend.sharedAt)
    expect(restored.ok && restored.people.map((person) => person.id)).toEqual(["friend", "second"])
    signInAs("friend")
    expect((await getPaste("priv"))?.slug).toBe("priv")

    // Only the owner can put someone back.
    signInAs("stranger")
    expect(await restoreRemovedShare("priv", "stranger", "edit", Date.now())).toMatchObject({
      ok: false,
    })
  })

  test("view access can't edit; edit access changes content but not how it's shared", async () => {
    await share("priv", "friend")
    signInAs("friend")
    expect(await updatePaste("priv", edit(), "Edited")).toBeNull()

    await share("priv", "friend", "edit")
    signInAs("friend")
    expect(await updatePaste("priv", edit({ slug: "stolen" }), "Edited")).toMatchObject({
      slug: "priv",
    })
    signInAs("owner")
    const saved = await getPaste("priv")
    expect(saved?.title).toBe("edited")
    expect(saved?.files[0]?.content).toBe("changed")
    expect(saved?.visibility).toBe("private")
    expect(saved?.collection).toBe("mine")

    signInAs("stranger")
    expect(await updatePaste("priv", edit(), "Edited")).toBeNull()
  })

  test("trashed, expired and burn-after-read pastes don't open through a share", async () => {
    await seedPaste({ slug: "burn", owner: "owner", visibility: "private", burnAfterRead: true })
    await seedPaste({
      slug: "old",
      owner: "owner",
      visibility: "private",
      expiresAt: new Date(Date.now() - 1000),
    })
    await seedPaste({ slug: "bin", owner: "owner", visibility: "private" })
    for (const slug of ["burn", "old", "bin"]) await share(slug, "friend")
    signInAs("owner")
    await trashPaste("bin")
    // Nothing new is shared from the trash, either.
    expect(await sharePaste("bin", "stranger", "view")).toBe(false)

    signInAs("friend")
    expect(await listShared()).toEqual([])
    expect((await navCounts()).shared).toBe(0)
    for (const slug of ["burn", "old", "bin"]) {
      expect(await getPaste(slug)).toBeNull()
      expect((await readSharedPaste(slug)).status).toBe("missing")
    }
  })

  test("a new paste can be shared as it's created", async () => {
    signInAs("owner")
    const { slug } = await createPaste(
      {
        ...edit({ visibility: "private", expiry: "never", collection: null }),
        title: "new",
      },
      [
        { userId: "friend", access: "edit" },
        { userId: "owner", access: "view" },
        { userId: "nobody", access: "view" },
      ],
    )
    expect((await listPasteShares(slug))?.map((p) => [p.id, p.access])).toEqual([
      ["friend", "edit"],
    ])
  })

  test("people are found by exact email or username only", async () => {
    signInAs("owner")
    expect(await findPerson("FRIEND@example.com")).toMatchObject({
      status: "ok",
      person: { id: "friend", handle: "@friend" },
    })
    expect(await findPerson("@Friend")).toMatchObject({ status: "ok", person: { id: "friend" } })
    expect(await findPerson("stranger@example.com")).toMatchObject({
      status: "ok",
      person: { handle: "stranger@example.com" },
    })
    expect(await findPerson("fri")).toEqual({ status: "missing" })
    expect(await findPerson("%")).toEqual({ status: "missing" })
    expect(await findPerson("owner@example.com")).toEqual({ status: "self" })
  })

  test("email invites require verified ownership when SMTP or an allowlist is configured", async () => {
    signInAs("owner")
    const keys = ["ALLOWED_EMAILS", "SMTP_HOST", "SMTP_PORT", "SMTP_FROM", "BETTER_AUTH_URL", "BETTER_AUTH_SECRET"] as const
    const previous = keys.map((key) => [key, process.env[key]] as const)
    try {
      for (const key of keys) delete process.env[key]
      for (const mode of ["allowlist", "smtp"] as const) {
        delete process.env.ALLOWED_EMAILS
        if (mode === "allowlist") process.env.ALLOWED_EMAILS = "friend@example.com"
        else Object.assign(process.env, {
          SMTP_HOST: "smtp.example.com",
          SMTP_PORT: "587",
          SMTP_FROM: "sniptide@example.com",
          BETTER_AUTH_URL: "http://localhost:3000",
          BETTER_AUTH_SECRET: "test-secret-that-is-long-enough-for-better-auth",
        })
        await getDb().update(user).set({ emailVerified: false }).where(eq(user.id, "friend"))
        expect(await findPerson("friend@example.com")).toEqual({ status: "missing" })
        expect(await findPerson("@friend")).toMatchObject({ status: "ok", person: { id: "friend" } })
        await getDb().update(user).set({ emailVerified: true }).where(eq(user.id, "friend"))
        expect(await findPerson("friend@example.com")).toMatchObject({ status: "ok", person: { id: "friend" } })
      }
    } finally {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })
})
