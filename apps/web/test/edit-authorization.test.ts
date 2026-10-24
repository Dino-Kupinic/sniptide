import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { paste, pasteRevision, user } from "@workspace/db/schema"
import { eq, sql } from "drizzle-orm"
import { getDb } from "@/lib/db"
import {
  leaveShare,
  restoreRevision,
  sharePaste,
  trashPaste,
  unsharePaste,
  updatePaste,
  updateSharing,
} from "@/lib/pastes/store"
import type { PasteInput } from "@/lib/pastes/types"
import { hasDatabase, pasteRow, resetDatabase, seedPaste, seedUser, signInAs } from "./harness"

const describeDb = hasDatabase ? describe : describe.skip
const input = (overrides: Partial<PasteInput> = {}): PasteInput => ({
  title: "Edited",
  description: "",
  files: [{ name: "a.txt", language: "text", content: "edited" }],
  visibility: "unlisted",
  expiry: "keep",
  slug: "",
  collection: null,
  password: "",
  burnAfterRead: false,
  ...overrides,
})

async function whileEditWaits<T>(edit: () => Promise<T>, change: () => Promise<unknown>) {
  const db = getDb()
  let pending: Promise<T> | undefined
  try {
    await db.transaction(async (gate) => {
      await gate.select({ id: user.id }).from(user).where(eq(user.id, "owner")).for("no key update")
      const [backend] = await gate
        .select({ pid: sql<number>`pg_backend_pid()` })
        .from(user)
        .limit(1)
      if (!backend) throw new Error("missing barrier connection")
      pending = edit()
      const deadline = Date.now() + 3000
      while (true) {
        const [waiter] = await db
          .select({ pid: sql<number>`pid` })
          .from(sql`pg_stat_activity`)
          .where(sql`datname = current_database() AND ${backend.pid} = ANY(pg_blocking_pids(pid))`)
        if (waiter) break
        if (Date.now() > deadline) throw new Error("edit did not reach the account lock")
      }
      await change()
    })
  } finally {
    await Promise.allSettled(pending ? [pending] : [])
  }
  if (!pending) throw new Error("edit did not start")
  return pending
}

describeDb("edit authorization under concurrent owner changes", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
    await seedUser("friend")
    signInAs("owner")
    await seedPaste({ slug: "race", owner: "owner", password: "original-password" })
    await updatePaste("race", input({ title: "First" }), "Edited")
    await updatePaste("race", input({ title: "Current" }), "Edited")
    await sharePaste("race", "friend", "edit")
  })

  for (const operation of ["save", "restore"] as const) {
    for (const change of ["revoke", "downgrade", "leave", "burn", "expire", "trash"] as const) {
      test(`${operation} refuses an editor after ${change} while waiting for the account lock`, async () => {
        const row = await pasteRow("race")
        const [revision] = await getDb()
          .select({ id: pasteRevision.id })
          .from(pasteRevision)
          .where(eq(pasteRevision.pasteId, row?.id ?? ""))
          .orderBy(pasteRevision.id)
        if (!revision) throw new Error("missing revision")
        signInAs("friend")
        const result = await whileEditWaits(
          async () =>
            operation === "save"
              ? (await updatePaste("race", input({ title: "Unauthorized" }), "Edited")) !== null
              : (await restoreRevision("race", revision.id)).ok,
          async () => {
            signInAs("owner")
            if (change === "revoke") await unsharePaste("race", "friend")
            else if (change === "downgrade") await sharePaste("race", "friend", "view")
            else if (change === "burn") await updateSharing("race", { burnAfterRead: true })
            else if (change === "trash") await trashPaste("race")
            else if (change === "expire") {
              await getDb()
                .update(paste)
                .set({ expiresAt: new Date(0) })
                .where(eq(paste.slug, "race"))
            } else {
              signInAs("friend")
              await leaveShare("race")
            }
          },
        )
        expect(result).toBe(false)
        expect((await pasteRow("race"))?.title).toBe("Current")
        expect(await getDb().select().from(pasteRevision)).toHaveLength(2)
      })
    }
  }

  for (const viewer of ["owner", "friend"] as const) {
    test(`${viewer} save keeps the fresh password and expiry while waiting`, async () => {
      signInAs(viewer)
      const result = await whileEditWaits(
        () => updatePaste("race", input({ title: "Allowed" }), "Edited"),
        async () => {
          signInAs("owner")
          await updateSharing("race", {
            password: "replacement-password",
            expiry: "1h",
            ...(viewer === "friend" ? { visibility: "private", allowRaw: false } : {}),
          })
        },
      )
      const row = await pasteRow("race")
      expect(result).toMatchObject({ hasPassword: true, expiresAt: row?.expiresAt?.getTime() })
      expect(row?.passwordHash).not.toBeNull()
      expect(row?.passwordHash).not.toBeUndefined()
      expect(row?.expiresAt).not.toBeNull()
      if (viewer === "friend") expect(row).toMatchObject({ visibility: "private", allowRaw: false })
      const { verifyPassword } = await import("@/lib/pastes/passwords")
      expect(await verifyPassword("replacement-password", row?.passwordHash ?? "")).toBe(true)
    })
  }

  test("an invite ahead of a save finishes without an account foreign-key deadlock", async () => {
    await seedUser("new-friend")
    const row = await pasteRow("race")
    if (!row) throw new Error("missing paste")
    const db = getDb()
    const operations: Promise<unknown>[] = []
    try {
      await db.transaction(async (gate) => {
        await gate.select({ id: paste.id }).from(paste).where(eq(paste.id, row.id)).for("update")
        const waitForBlocked = async (count: number) => {
          const deadline = Date.now() + 3000
          while (true) {
            const blocked = await db
              .select({ pid: sql<number>`pid` })
              .from(sql`pg_stat_activity`)
              .where(
                sql`datname = current_database() AND application_name = 'sniptide'
                  AND wait_event_type = 'Lock' AND cardinality(pg_blocking_pids(pid)) > 0`,
              )
            if (blocked.length >= count) return
            if (Date.now() > deadline) throw new Error("operation did not reach the paste lock")
          }
        }
        operations.push(sharePaste("race", "new-friend", "edit"))
        await waitForBlocked(1)
        operations.push(updatePaste("race", input({ title: "After invite" }), "Edited"))
        await waitForBlocked(2)
      })
    } finally {
      await Promise.allSettled(operations)
    }
    expect(await Promise.all(operations)).toMatchObject([true, { slug: "race" }])
    expect((await pasteRow("race"))?.title).toBe("After invite")
  })
})
