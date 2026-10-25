import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import path from "node:path"
import {
  inspectModeration,
  type ModerationState,
  moderationCommandSchema,
  transitionModeration,
} from "@workspace/db/moderation"
import {
  moderationEvent,
  notification,
  paste,
  pasteFile,
  pasteRevision,
  pasteShare,
  pasteStar,
  user,
} from "@workspace/db/schema"
import { eq, sql } from "drizzle-orm"
import { GET as preview } from "@/app/[slug]/preview/route"
import { GET as raw } from "@/app/[slug]/raw/route"
import { POST as reveal } from "@/app/[slug]/reveal/route"
import { POST as unlockRoute } from "@/app/[slug]/unlock/route"
import { GET as apiGet, PUT as apiPut } from "@/app/api/v1/pastes/[id]/route"
import { GET as apiList } from "@/app/api/v1/pastes/route"
import {
  collectionCaptures,
  getCapture,
  listCaptures,
  parseListQuery,
  updateCapture,
} from "@/lib/api/pastes"
import { createToken } from "@/lib/api/tokens"
import {
  createCollection,
  deleteCollection,
  listCollections,
  restoreCollection,
} from "@/lib/collections/store"
import { getDb } from "@/lib/db"
import { listNotifications } from "@/lib/notifications/store"
import { getAnalyticsReport } from "@/lib/pastes/analytics-report"
import { storageUsage } from "@/lib/pastes/budget"
import { getDashboardData } from "@/lib/pastes/dashboard"
import { parsePasteListQuery } from "@/lib/pastes/list-query"
import { listPastePage, listSharedPage, trashTotals } from "@/lib/pastes/lists"
import { parseSharedListQuery } from "@/lib/pastes/shared-list-query"
import {
  deleteForever,
  getPaste,
  getPasteMeta,
  getShare,
  getUnlockHash,
  isSlugAvailable,
  isStarred,
  listOwnPastes,
  listPasteShares,
  listShared,
  listStarred,
  listTrash,
  navCounts,
  readPublicPreview,
  readRawFile,
  readSharedMeta,
  readSharedPaste,
  readWebhookPaste,
  renamePaste,
  restorePaste,
  restoreRevision,
  restoreShare,
  sealRevision,
  searchOwnPastes,
  setPasteCollection,
  setStarred,
  sharePaste,
  sidebarData,
  starredSlugs,
  trashPaste,
  updatePaste,
  updateSharing,
} from "@/lib/pastes/store"
import type { PasteInput } from "@/lib/pastes/types"
import {
  hasDatabase,
  pasteRow,
  resetDatabase,
  seedPaste,
  seedUser,
  signInAs,
  unlock,
} from "./harness"

const describeDb = hasDatabase ? describe : describe.skip
const restricted = ["pending", "quarantined", "removed"] as const
const synthetic = "synthetic-moderation-marker"
const edit: PasteInput = {
  title: "changed",
  description: "",
  slug: "",
  visibility: "public",
  expiry: "keep",
  collection: null,
  password: null,
  burnAfterRead: false,
  files: [{ name: "changed.txt", language: "text", content: "changed" }],
}
async function command(pasteId: string, state: ModerationState) {
  const current = await inspectModeration(getDb(), pasteId)
  if (!current) throw new Error("Missing test paste")
  return {
    commandId: crypto.randomUUID(),
    pasteId,
    expectedContentVersion: current.contentVersion,
    expectedModerationVersion: current.moderationVersion,
    state,
    reasonCode: "review" as const,
    caseReference: crypto.randomUUID(),
  }
}
async function transition(pasteId: string, state: ModerationState) {
  return transitionModeration(getDb(), await command(pasteId, state), "test-operator@test-host")
}
async function fixture() {
  const target = await seedPaste({
    slug: synthetic,
    title: synthetic,
    content: synthetic,
    owner: "owner",
    visibility: "public",
    collection: "examples",
  })
  await getDb()
    .insert(pasteRevision)
    .values({
      pasteId: target.id,
      message: synthetic,
      snapshot: {
        title: synthetic,
        description: synthetic,
        files: [{ name: synthetic, language: "text", content: synthetic }],
      },
    })
  await getDb().insert(pasteShare).values({ pasteId: target.id, userId: "editor", access: "edit" })
  await getDb().insert(pasteStar).values({ pasteId: target.id, userId: "owner" })
  await getDb()
    .insert(notification)
    .values({ pasteId: target.id, userId: "owner", kind: "views", count: 100 })
  return target
}

describeDb("host moderation", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
    await seedUser("editor")
    signInAs("owner")
  })

  test("the host command inspects and restricts without printing content or accepting arbitrary fields", async () => {
    const target = await fixture()
    const run = async (args: string[]) => {
      const child = Bun.spawn(
        ["bun", path.join(import.meta.dir, "../../../packages/db/src/moderation-cli.ts"), ...args],
        {
          env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
          stdout: "pipe",
          stderr: "pipe",
        },
      )
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])
      return { code, stdout, stderr }
    }
    const before = await run(["inspect", target.id])
    expect(before.code).toBe(0)
    expect(JSON.parse(before.stdout).state).toBe("allowed")
    expect(before.stdout).not.toContain(synthetic)
    const input = await command(target.id, "quarantined")
    const applied = await run(["transition", JSON.stringify(input)])
    expect(applied.code).toBe(0)
    expect(JSON.parse(applied.stdout).toState).toBe("quarantined")
    expect(applied.stdout + applied.stderr).not.toContain(synthetic)
    const retry = await run(["transition", JSON.stringify(input)])
    expect(retry.stdout).toBe(applied.stdout)
    const rejected = await run(["transition", JSON.stringify({ ...input, evidence: synthetic })])
    expect(rejected.code).not.toBe(0)
    expect(rejected.stdout + rejected.stderr).not.toContain(synthetic)
  })

  test("defaults to allowed, atomically increments both versions and replays the identical event", async () => {
    const target = await fixture()
    const before = await inspectModeration(getDb(), target.id)
    expect(before?.state).toBe("allowed")
    expect(before?.moderationVersion).toBe(0)
    const input = await command(target.id, "quarantined")
    const [first, retry] = await Promise.all([
      transitionModeration(getDb(), input, "operator"),
      transitionModeration(getDb(), input, "operator"),
    ])
    expect(retry).toEqual(first)
    expect(await inspectModeration(getDb(), target.id)).toEqual({
      pasteId: target.id,
      state: "quarantined",
      contentVersion: input.expectedContentVersion + 1,
      moderationVersion: 1,
    })
    expect(await getDb().select().from(moderationEvent)).toHaveLength(1)
    expect(JSON.stringify(first)).not.toContain(synthetic)
    await expect(
      transitionModeration(getDb(), { ...input, state: "removed" }, "operator"),
    ).rejects.toThrow("different inputs")
    await expect(transitionModeration(getDb(), input, "other-operator")).rejects.toThrow(
      "different inputs",
    )
    await expect(
      transitionModeration(getDb(), { ...input, commandId: crypto.randomUUID() }, "operator"),
    ).rejects.toThrow("version conflict")
  })

  test("strict input rejects evidence-shaped fields and invalid states or versions", async () => {
    const target = await fixture()
    const input = await command(target.id, "pending")
    for (const invalid of [
      { ...input, body: synthetic },
      { ...input, state: "approve" },
      { ...input, reasonCode: synthetic },
      { ...input, caseReference: synthetic },
      { ...input, expectedContentVersion: -1 },
      { ...input, expectedModerationVersion: 0.1 },
    ]) {
      expect(moderationCommandSchema.safeParse(invalid).success).toBe(false)
    }
  })

  test("a failed audit insert rolls the state and both versions back", async () => {
    const target = await fixture()
    const before = await inspectModeration(getDb(), target.id)
    await getDb().execute(
      sql`ALTER TABLE moderation_event ADD CONSTRAINT test_audit_failure CHECK (actor <> 'reject-test-actor')`,
    )
    try {
      await expect(
        transitionModeration(getDb(), await command(target.id, "removed"), "reject-test-actor"),
      ).rejects.toThrow()
      expect(await inspectModeration(getDb(), target.id)).toEqual(before)
      expect(await getDb().select().from(moderationEvent)).toHaveLength(0)
    } finally {
      await getDb().execute(sql`ALTER TABLE moderation_event DROP CONSTRAINT test_audit_failure`)
    }
  })

  for (const state of restricted) {
    test(`${state} denies every ordinary read, metadata projection and expanding mutation`, async () => {
      await createCollection("Examples")
      const target = await fixture()
      const original = await pasteRow(target.slug)
      const revisions = await getDb().select().from(pasteRevision)
      await transition(target.id, state)
      for (const viewer of ["owner", "editor", null]) {
        signInAs(viewer)
        expect(await getPaste(target.slug)).toBeNull()
        expect(await getPasteMeta(target.slug)).toBeNull()
        expect(await readSharedPaste(target.slug, { reveal: true, visit: true })).toEqual({
          status: "missing",
        })
        expect(await readRawFile(target.slug, null)).toEqual({ status: "missing" })
        expect(await readSharedMeta(target.slug)).toBeNull()
        expect(await readPublicPreview(target.slug)).toBeNull()
        expect(await getUnlockHash(target.slug)).toBeNull()
        expect(await getShare(target.slug)).toBeNull()
        if (viewer) {
          expect(await listOwnPastes()).toEqual([])
          expect(await listShared()).toEqual([])
          expect(await listStarred()).toEqual([])
          expect(await getCapture(viewer, target.id)).toBeNull()
          expect(await getCapture(viewer, target.slug)).toBeNull()
          expect(await listPasteShares(target.slug)).toBeNull()
          expect(await readWebhookPaste(target.slug)).toBeNull()
          expect(await searchOwnPastes("synthetic")).toEqual({ hits: [], total: 0 })
          expect(await navCounts()).toEqual({ pastes: 0, starred: 0, shared: 0 })
          expect((await sidebarData()).recent).toEqual([])
          expect(await starredSlugs()).toEqual(new Set())
          expect(await isStarred(target.slug)).toBe(false)
          expect(
            (await listPastePage({ mode: "mine" }, parsePasteListQuery({}))).pagination.totalAll,
          ).toBe(0)
          expect((await listSharedPage(parseSharedListQuery({}))).pagination.totalAll).toBe(0)
          expect(await updatePaste(target.slug, edit, "Edited")).toBeNull()
          expect((await restoreRevision(target.slug, revisions[0]?.id ?? -1)).ok).toBe(false)
          expect(await sealRevision(target.slug, synthetic)).toBe(false)
          expect(await restoreShare(target.slug)).toBe(false)
          await setStarred(target.slug, true)
        }
      }
      signInAs("owner")
      expect(await listTrash()).toEqual([])
      expect(await trashTotals()).toEqual({ count: 0, bytes: 0 })
      expect((await storageUsage()).pastes).toBe(0)
      expect((await getDashboardData()).totalPastes).toBe(0)
      const analytics = await getAnalyticsReport({ range: "30d", paste: target.slug })
      expect(analytics.pasteCount).toBe(0)
      expect(JSON.stringify(analytics)).not.toContain(synthetic)
      expect(await listNotifications()).toEqual({ items: [], unread: 0 })
      expect((await listCollections())[0]?.pasteCount).toBe(0)
      expect((await listCaptures("owner", parseListQuery(new URLSearchParams()))).pastes).toEqual(
        [],
      )
      expect((await collectionCaptures("owner", "examples", null))?.pastes).toEqual([])
      await expect(
        updateCapture("owner", target.id, {
          title: "changed",
          files: [{ name: "a.txt", content: "changed" }],
        }),
      ).rejects.toThrow("No paste")
      expect(await updateSharing(target.slug, { visibility: "public" })).toBeNull()
      expect(await sharePaste(target.slug, "editor", "view")).toBe(false)
      expect(await restorePaste(target.slug)).toBe(false)
      expect(await isSlugAvailable(target.slug)).toBe(false)
      await renamePaste(target.slug, "changed")
      await setPasteCollection(target.slug, null)
      const snapshot = await deleteCollection("examples")
      expect(snapshot?.pastes).toEqual([])
      if (snapshot) await restoreCollection({ ...snapshot, pastes: [target.slug] })
      expect((await pasteRow(target.slug))?.title).toBe(original?.title)
      expect((await pasteRow(target.slug))?.moderationState).toBe(state)
      expect((await getDb().select().from(pasteFile))[0]?.content).toBe(synthetic)
      expect(await getDb().select().from(pasteRevision)).toEqual(revisions)
      expect(await getDb().select().from(pasteShare)).toHaveLength(1)
      expect(await getDb().select().from(pasteStar)).toHaveLength(1)
    })

    test(`${state} suppresses protected and burn pastes for owners, invitees and unlocked visitors`, async () => {
      for (const visibility of ["private", "unlisted", "public"] as const) {
        for (const burnAfterRead of [false, true]) {
          const target = await seedPaste({
            slug: `${visibility}-${burnAfterRead}`,
            owner: "owner",
            visibility,
            password: "synthetic-password",
            burnAfterRead,
          })
          await getDb()
            .insert(pasteShare)
            .values({ pasteId: target.id, userId: "editor", access: "edit" })
          await unlock(target.slug)
          await transition(target.id, state)
          for (const viewer of ["owner", "editor", null]) {
            signInAs(viewer)
            expect(await readSharedPaste(target.slug, { reveal: true })).toEqual({
              status: "missing",
            })
            expect(await readRawFile(target.slug, null)).toEqual({ status: "missing" })
          }
          expect((await pasteRow(target.slug))?.deletedAt).toBeNull()
        }
      }
    })

    test(`${state} returns no-store denials through raw, preview, reveal, unlock and token routes`, async () => {
      const target = await fixture()
      const token = await createToken("owner", {
        name: "moderation-test",
        write: true,
        expiry: "never",
      })
      if (!token.ok) throw new Error(token.error)
      const request = (method = "GET", body?: unknown) =>
        new Request(`http://localhost:3000/${target.slug}`, {
          method,
          headers: { authorization: `Bearer ${token.token}`, "content-type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}),
        })
      const slugContext = { params: Promise.resolve({ slug: target.slug }) }
      const idContext = { params: Promise.resolve({ id: target.id }) }
      const allowed = await raw(request(), slugContext)
      expect(allowed.status).toBe(200)
      expect(allowed.headers.get("cache-control")).toContain("no-store")
      await transition(target.id, state)
      for (const response of [
        await raw(request(), slugContext),
        await preview(request(), slugContext),
        await reveal(request("POST"), slugContext),
        await unlockRoute(request("POST", { password: "synthetic-password" }), slugContext),
        await apiGet(request(), idContext),
        await apiPut(
          request("PUT", { title: "changed", files: [{ name: "a.txt", content: "changed" }] }),
          idContext,
        ),
      ]) {
        expect(response.status).toBeGreaterThanOrEqual(400)
        expect(response.headers.get("cache-control")).toContain("no-store")
        expect(await response.text()).not.toContain(synthetic)
      }
      const response = await apiList(request())
      expect(response.headers.get("cache-control")).toContain("no-store")
      expect(await response.text()).not.toContain(synthetic)
    })
  }

  test("release retains passwords, visibility, burn settings and invalidates stale editors", async () => {
    const target = await seedPaste({
      slug: "protected",
      owner: "owner",
      visibility: "private",
      password: "synthetic-password",
      burnAfterRead: true,
    })
    const before = await pasteRow(target.slug)
    await transition(target.id, "quarantined")
    await transition(target.id, "allowed")
    const after = await pasteRow(target.slug)
    expect(after?.passwordHash).toBe(before?.passwordHash)
    expect(after?.visibility).toBe("private")
    expect(after?.burnAfterRead).toBe(true)
    expect(
      await updatePaste(target.slug, edit, "Edited", { expectedVersion: before?.version }),
    ).toMatchObject({ conflict: true })
    signInAs(null)
    expect(await readSharedPaste(target.slug)).toEqual({ status: "missing" })
  })

  test("normal paste and account deletion proceed while only audit metadata survives", async () => {
    const target = await fixture()
    const input = await command(target.id, "removed")
    const event = await transitionModeration(getDb(), input, "operator")
    await trashPaste(target.slug)
    await deleteForever(target.slug)
    expect(await pasteRow(target.slug)).toBeUndefined()
    expect(await transitionModeration(getDb(), input, "operator")).toEqual(event)
    const other = await fixture()
    await transition(other.id, "pending")
    await getDb().delete(user).where(eq(user.id, "owner"))
    expect(await getDb().select().from(paste)).toHaveLength(0)
    expect(await getDb().select().from(pasteFile)).toHaveLength(0)
    expect(await getDb().select().from(pasteRevision)).toHaveLength(0)
    const events = await getDb().select().from(moderationEvent)
    expect(events).toHaveLength(2)
    expect(JSON.stringify(events)).not.toContain(synthetic)
  })

  test("deleting a collection clears restricted associations without exposing them in Undo", async () => {
    await createCollection("Examples")
    const target = await fixture()
    await transition(target.id, "quarantined")
    const deleted = await deleteCollection("examples")
    expect(deleted?.pastes).toEqual([])
    expect((await pasteRow(target.slug))?.collection).toBeNull()
    await createCollection("Examples")
    await transition(target.id, "allowed")
    expect((await getPaste(target.slug))?.collection).toBeNull()
    expect((await listCollections())[0]?.pasteCount).toBe(0)
  })

  test("moderating a whole selected page cannot truncate API, collection or web pagination", async () => {
    await createCollection("Examples")
    const targets: Awaited<ReturnType<typeof seedPaste>>[] = []
    for (let index = 0; index < 51; index++) {
      const target = await seedPaste({
        slug: `snapshot-${index}`,
        owner: "owner",
        title: index === 50 ? "z-allowed" : `a-review-${String(index).padStart(2, "0")}`,
        collection: "examples",
      })
      await getDb()
        .update(paste)
        .set({
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
          updatedAt: new Date(Date.UTC(2026, 0, 2, 0, 0, -index)),
        })
        .where(eq(paste.id, target.id))
      targets.push(target)
    }
    const apiQuery = parseListQuery(new URLSearchParams({ limit: "50" }))
    const webQuery = parsePasteListQuery({ sort: "title" })
    const reads: [
      Promise<Awaited<ReturnType<typeof listCaptures>>>,
      Promise<Awaited<ReturnType<typeof collectionCaptures>>>,
      Promise<Awaited<ReturnType<typeof listPastePage>>>,
    ] = await getDb().transaction(async (gate) => {
      await gate.execute(sql`LOCK TABLE paste_file IN ACCESS EXCLUSIVE MODE`)
      const pending: typeof reads = [
        listCaptures("owner", apiQuery),
        collectionCaptures("owner", "examples", null),
        listPastePage({ mode: "mine" }, webQuery),
      ]
      const deadline = Date.now() + 3000
      let waiting = 0
      while (Date.now() < deadline) {
        const blocked = await getDb().execute(
          sql`SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND application_name = 'sniptide' AND wait_event_type = 'Lock' AND cardinality(pg_blocking_pids(pid)) > 0`,
        )
        waiting = blocked.length
        if (waiting >= 3) break
      }
      expect(waiting).toBeGreaterThanOrEqual(3)
      for (const target of targets.slice(0, 50)) await transition(target.id, "quarantined")
      return pending
    })
    const [apiPage, collectionPage, webPage] = await Promise.all(reads)
    expect(apiPage.pastes).toHaveLength(50)
    expect(apiPage.nextCursor).toBeTruthy()
    expect(collectionPage?.pastes).toHaveLength(50)
    expect(collectionPage?.nextCursor).toBeTruthy()
    expect(webPage.pastes).toHaveLength(10)
    expect("nextCursor" in webPage.pagination && webPage.pagination.nextCursor).toBeTruthy()
    const nextApi = await listCaptures("owner", { ...apiQuery, cursor: apiPage.nextCursor })
    expect(nextApi.pastes.map((item) => item.slug)).toEqual(["snapshot-50"])
    const nextCollection = await collectionCaptures(
      "owner",
      "examples",
      collectionPage?.nextCursor ?? null,
    )
    expect(nextCollection?.pastes.map((item) => item.slug)).toEqual(["snapshot-50"])
    const freshWeb = await listPastePage({ mode: "mine" }, webQuery)
    expect(freshWeb.pastes.map((item) => item.slug)).toEqual(["snapshot-50"])
    expect(freshWeb.pagination.total).toBe(1)
  })

  for (const operation of ["restoreShare", "sealRevision"] as const) {
    test(`${operation} serializes its child update before a moderation transition`, async () => {
      const target = await fixture()
      if (operation === "restoreShare") {
        await getDb().update(pasteShare).set({ leftAt: new Date() })
        signInAs("editor")
      }
      const pending: Promise<unknown>[] = []
      try {
        await getDb().transaction(async (gate) => {
          if (operation === "restoreShare") {
            await gate.select().from(pasteShare).for("update")
          } else {
            await gate.select().from(pasteRevision).for("update")
          }
          pending.push(
            operation === "restoreShare"
              ? restoreShare(target.slug)
              : sealRevision(target.slug, synthetic),
          )
          const waitForLocks = async (count: number) => {
            const deadline = Date.now() + 3000
            while (Date.now() < deadline) {
              const rows = await getDb().execute(
                sql`SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND application_name = 'sniptide' AND wait_event_type = 'Lock' AND cardinality(pg_blocking_pids(pid)) > 0`,
              )
              if (rows.length >= count) return true
            }
            return false
          }
          expect(await waitForLocks(1)).toBe(true)
          pending.push(transition(target.id, "quarantined"))
          expect(await waitForLocks(2)).toBe(true)
        })
      } finally {
        const outcomes = await Promise.allSettled(pending)
        expect(outcomes.every((result) => result.status === "fulfilled")).toBe(true)
      }
      expect((await pasteRow(target.slug))?.moderationState).toBe("quarantined")
      expect(await restoreShare(target.slug)).toBe(false)
      expect(await sealRevision(target.slug, synthetic)).toBe(false)
    })
  }

  for (const editor of ["browser", "api", "restore"] as const) {
    test(`restriction commits while a stale ${editor} mutation waits on its account lock`, async () => {
      const target = await fixture()
      const beforeFiles = await getDb().select().from(pasteFile)
      const beforeRevisions = await getDb().select().from(pasteRevision)
      const operations: Promise<unknown>[] = []
      try {
        await getDb().transaction(async (gate) => {
          await gate.select().from(user).where(eq(user.id, "owner")).for("update")
          operations.push(
            editor === "browser"
              ? updatePaste(target.slug, edit, "Edited")
              : editor === "api"
                ? updateCapture("owner", target.id, {
                    title: "changed",
                    files: [{ name: "a.txt", content: "changed" }],
                  }).catch(() => null)
                : restoreRevision(target.slug, beforeRevisions[0]?.id ?? -1),
          )
          const deadline = Date.now() + 2000
          let waiting = false
          while (Date.now() < deadline) {
            const blocked = await getDb().execute(
              sql`SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND application_name = 'sniptide' AND wait_event_type = 'Lock' AND cardinality(pg_blocking_pids(pid)) > 0`,
            )
            if (blocked.length) {
              waiting = true
              break
            }
          }
          expect(waiting).toBe(true)
          await transition(target.id, "quarantined")
        })
      } finally {
        await Promise.allSettled(operations)
      }
      expect(await getDb().select().from(pasteFile)).toEqual(beforeFiles)
      expect(await getDb().select().from(pasteRevision)).toEqual(beforeRevisions)
      expect((await pasteRow(target.slug))?.title).toBe(synthetic)
    })
  }
})
