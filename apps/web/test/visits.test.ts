import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import {
  notification,
  paste,
  pasteFile,
  pasteShare,
  pasteViewDay,
  pasteVisit,
} from "@workspace/db/schema"
import { eq, sql } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { readRawFile, readSharedPaste, sharePaste } from "@/lib/pastes/store"
import {
  drainVisits,
  scheduleVisitDrain,
  visitQueuePressure,
  visitQueueSnapshot,
} from "@/lib/pastes/visits"
import {
  hasDatabase,
  pasteRow,
  resetDatabase,
  seedPaste,
  seedUser,
  signInAs,
  unlock,
  viewDayTotal,
} from "./harness"

const describeDb = hasDatabase ? describe : describe.skip
const DAY = 86_400_000
const visit = (slug = "ordinary") => readSharedPaste(slug, { visit: true })
const pending = () => getDb().select().from(pasteVisit)

async function enqueue(
  pasteId: string,
  count: number,
  day = Math.floor(Date.now() / DAY),
  acceptedAt = new Date(),
) {
  await getDb()
    .insert(pasteVisit)
    .values(Array.from({ length: count }, () => ({ pasteId, day, acceptedAt })))
}

function deferred() {
  let resolve = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function waitForBlockedReader() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const [row] = await getDb().execute<{ count: number }>(sql`
      SELECT count(*)::int AS count FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'
        AND query LIKE '%paste%' AND pid <> pg_backend_pid()`)
    if (row?.count) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("Expected a read waiting for the paste lock")
}

describeDb("durable ordinary visits", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await drainVisits()
    await seedUser("owner")
    await seedUser("reader")
    await seedPaste({ slug: "ordinary", owner: "owner", visibility: "public" })
    signInAs("reader")
  })

  test("content success commits a pending visit without updating lifetime or daily counters", async () => {
    const result = await visit()
    expect(result.status).toBe("ok")
    if (result.status === "ok") expect(result.paste.views).toBe(0)
    expect(await pending()).toHaveLength(1)
    expect((await pasteRow("ordinary"))?.views).toBe(0)
    expect(await viewDayTotal("ordinary")).toBe(0)
    expect(await drainVisits()).toEqual({ consumed: 1, pastes: 1 })
    expect((await pasteRow("ordinary"))?.views).toBe(1)
    expect((await pasteRow("ordinary"))?.uniqueViews).toBe(1)
    expect(await viewDayTotal("ordinary")).toBe(1)
    expect(await pending()).toEqual([])
    expect(await drainVisits()).toEqual({ consumed: 0, pastes: 0 })
    expect((await pasteRow("ordinary"))?.views).toBe(1)
  })

  test("owners, uncounted content and raw reads do not enqueue ordinary views", async () => {
    await readSharedPaste("ordinary")
    await readRawFile("ordinary", null)
    signInAs("owner")
    await visit()
    expect(await pending()).toEqual([])
  })

  test("an enqueue failure rejects the content read and is not automatically retried", async () => {
    const db = getDb()
    await db.execute(sql`CREATE SEQUENCE visit_enqueue_attempt`)
    await db.execute(sql`CREATE FUNCTION reject_visit_enqueue() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM nextval('visit_enqueue_attempt'); RAISE EXCEPTION 'injected enqueue failure'; END $$`)
    await db.execute(
      sql`CREATE TRIGGER reject_visit_enqueue BEFORE INSERT ON paste_visit FOR EACH ROW EXECUTE FUNCTION reject_visit_enqueue()`,
    )
    try {
      await expect(visit()).rejects.toThrow()
      expect(await pending()).toEqual([])
      expect((await pasteRow("ordinary"))?.views).toBe(0)
      const [attempt] = await db.execute<{ attempts: number }>(
        sql`SELECT last_value::int AS attempts FROM visit_enqueue_attempt`,
      )
      expect(attempt?.attempts).toBe(1)
    } finally {
      await db.execute(sql`DROP TRIGGER reject_visit_enqueue ON paste_visit`)
      await db.execute(sql`DROP FUNCTION reject_visit_enqueue()`)
      await db.execute(sql`DROP SEQUENCE visit_enqueue_attempt`)
    }
  })

  test("draining after midnight preserves each visit's accepted UTC day", async () => {
    const row = await pasteRow("ordinary")
    if (!row) throw new Error("missing paste")
    const today = Math.floor(Date.now() / DAY)
    await enqueue(row.id, 2, today - 1, new Date(today * DAY - 1))
    await enqueue(row.id, 3, today, new Date(today * DAY))
    await drainVisits()
    const days = await getDb().select().from(pasteViewDay).orderBy(pasteViewDay.day)
    expect(days.map(({ day, views }) => [day, views])).toEqual([
      [today - 1, 2],
      [today, 3],
    ])
    expect((await pasteRow("ordinary"))?.views).toBe(5)
  })

  test("the default batch consumes at most 500 rows and leaves a durable remainder", async () => {
    const row = await pasteRow("ordinary")
    if (!row) throw new Error("missing paste")
    await enqueue(row.id, 501)
    expect(await drainVisits()).toEqual({ consumed: 500, pastes: 1 })
    expect(await pending()).toHaveLength(1)
    expect((await pasteRow("ordinary"))?.views).toBe(500)
    expect(await drainVisits()).toEqual({ consumed: 1, pastes: 1 })
    expect((await pasteRow("ordinary"))?.views).toBe(501)
  })

  test("all milestones crossed by one batch are notified exactly once", async () => {
    const row = await pasteRow("ordinary")
    if (!row) throw new Error("missing paste")
    await getDb().update(paste).set({ views: 8, uniqueViews: 2 }).where(eq(paste.id, row.id))
    await enqueue(row.id, 100)
    await drainVisits()
    await drainVisits()
    const notices = await getDb().select().from(notification).orderBy(notification.count)
    expect(notices.map(({ count }) => count)).toEqual([10, 50, 100])
    expect((await pasteRow("ordinary"))?.views).toBe(108)
    expect((await pasteRow("ordinary"))?.uniqueViews).toBe(102)
  })

  test("failure after counters and notifications rolls back the whole batch for a safe retry", async () => {
    const db = getDb()
    const row = await pasteRow("ordinary")
    if (!row) throw new Error("missing paste")
    await db.update(paste).set({ views: 9 }).where(eq(paste.id, row.id))
    await enqueue(row.id, 2)
    await db.execute(sql`CREATE FUNCTION reject_visit_delete() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'injected drain failure'; END $$`)
    await db.execute(
      sql`CREATE TRIGGER reject_visit_delete BEFORE DELETE ON paste_visit FOR EACH ROW EXECUTE FUNCTION reject_visit_delete()`,
    )
    try {
      await expect(drainVisits()).rejects.toThrow()
      expect((await pasteRow("ordinary"))?.views).toBe(9)
      expect(await viewDayTotal("ordinary")).toBe(0)
      expect(await db.select().from(notification)).toEqual([])
      expect(await pending()).toHaveLength(2)
      expect(visitQueuePressure()).toBe(true)
      expect(visitQueueSnapshot()).toMatchObject({ failed: true })
      expect(visitQueueSnapshot().lastFailureAt).toBeGreaterThan(0)
    } finally {
      await db.execute(sql`DROP TRIGGER reject_visit_delete ON paste_visit`)
      await db.execute(sql`DROP FUNCTION reject_visit_delete()`)
    }
    expect(await drainVisits()).toEqual({ consumed: 2, pastes: 1 })
    expect((await pasteRow("ordinary"))?.views).toBe(11)
    expect(await viewDayTotal("ordinary")).toBe(2)
    expect(await db.select().from(notification)).toHaveLength(1)
    expect(visitQueuePressure()).toBe(false)
    expect(visitQueueSnapshot().lastSuccessAt).toBeGreaterThan(0)
  })

  test("a second worker skips while the transaction advisory lock is held", async () => {
    await visit()
    const locked = deferred()
    const release = deferred()
    const holder = getDb().transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${0x5e1d_7a20})`)
      locked.resolve()
      await release.promise
    })
    await locked.promise
    try {
      expect(await drainVisits()).toBeNull()
      expect(await pending()).toHaveLength(1)
    } finally {
      release.resolve()
      await holder
    }
    const runs = await Promise.all([drainVisits(), drainVisits()])
    expect(runs.reduce((sum, result) => sum + (result?.consumed ?? 0), 0)).toBe(1)
    expect((await pasteRow("ordinary"))?.views).toBe(1)
  })

  test("accepted deltas apply after trash, expiry and moderation but hard deletion cascades", async () => {
    const db = getDb()
    await visit()
    await db
      .update(paste)
      .set({ deletedAt: new Date(), expiresAt: new Date(0), moderationState: "removed" })
      .where(eq(paste.slug, "ordinary"))
    expect(await drainVisits()).toMatchObject({ consumed: 1 })
    expect((await pasteRow("ordinary"))?.views).toBe(1)
    const other = await seedPaste({ slug: "deleted", owner: "owner" })
    await enqueue(other.id, 3)
    await db.delete(paste).where(eq(paste.id, other.id))
    expect(await pending()).toEqual([])
    expect(await drainVisits()).toMatchObject({ consumed: 0 })
  })

  test("sampled backlog and lag each refuse pressure until a successful drain catches up", async () => {
    const original = process.env.VISIT_QUEUE_MAX_BACKLOG
    process.env.VISIT_QUEUE_MAX_BACKLOG = "2"
    try {
      const row = await pasteRow("ordinary")
      if (!row) throw new Error("missing paste")
      await enqueue(row.id, 2, Math.floor(Date.now() / DAY), new Date(Date.now() - 60_000))
      await drainVisits({ batchSize: 1 })
      expect(visitQueueSnapshot().backlog).toBe(1)
      expect(visitQueueSnapshot().oldestAgeMs).toBeGreaterThan(30_000)
      expect(visitQueuePressure()).toBe(true)
      await drainVisits()
      expect(visitQueuePressure()).toBe(false)
      await enqueue(row.id, 3)
      await drainVisits({ batchSize: 1 })
      expect(visitQueueSnapshot().backlog).toBe(2)
      expect(visitQueueSnapshot().oldestAgeMs).toBeLessThan(30_000)
      expect(visitQueuePressure()).toBe(true)
      await drainVisits({ batchSize: 1 })
      expect(visitQueueSnapshot().backlog).toBe(1)
      expect(visitQueuePressure()).toBe(false)
      await drainVisits()
      expect(visitQueueSnapshot()).toMatchObject({ backlog: 0, oldestAgeMs: 0, failed: false })
    } finally {
      if (original === undefined) delete process.env.VISIT_QUEUE_MAX_BACKLOG
      else process.env.VISIT_QUEUE_MAX_BACKLOG = original
    }
  })

  test("the scheduler awaits startup and never overlaps interval drains", async () => {
    const globals = globalThis as typeof globalThis & {
      __sniptideVisitSchedule?: Promise<void>
      __sniptideVisitTimer?: ReturnType<typeof setInterval>
    }
    const initial = deferred()
    const intervalStarted = deferred()
    const intervalFinished = deferred()
    let runs = 0
    let ready = false
    const scheduled = scheduleVisitDrain(async () => {
      runs++
      if (runs === 1) await initial.promise
      else {
        intervalStarted.resolve()
        await intervalFinished.promise
      }
      return { consumed: 0, pastes: 0 }
    }).then(() => {
      ready = true
    })
    try {
      expect(scheduleVisitDrain()).toBe(globals.__sniptideVisitSchedule)
      await Promise.resolve()
      expect(ready).toBe(false)
      expect(globals.__sniptideVisitTimer).toBeUndefined()
      initial.resolve()
      await scheduled
      expect(ready).toBe(true)
      await intervalStarted.promise
      await new Promise((resolve) => setTimeout(resolve, 1200))
      expect(runs).toBe(2)
    } finally {
      initial.resolve()
      intervalFinished.resolve()
      if (globals.__sniptideVisitTimer) clearInterval(globals.__sniptideVisitTimer)
      delete globals.__sniptideVisitTimer
      delete globals.__sniptideVisitSchedule
      await scheduled
    }
  })

  test("a failed startup drain rejects readiness and can be scheduled again", async () => {
    const globals = globalThis as typeof globalThis & {
      __sniptideVisitSchedule?: Promise<void>
      __sniptideVisitTimer?: ReturnType<typeof setInterval>
    }
    try {
      await expect(
        scheduleVisitDrain(async () => {
          throw new Error("startup failed")
        }),
      ).rejects.toThrow("startup failed")
      expect(globals.__sniptideVisitTimer).toBeUndefined()
      expect(globals.__sniptideVisitSchedule).toBeUndefined()
      await scheduleVisitDrain()
      expect(globals.__sniptideVisitTimer).toBeDefined()
    } finally {
      if (globals.__sniptideVisitTimer) clearInterval(globals.__sniptideVisitTimer)
      delete globals.__sniptideVisitTimer
      delete globals.__sniptideVisitSchedule
    }
  })

  for (const change of ["burn", "private", "revoked", "password", "moderated"] as const) {
    test(`a blocked content read revalidates a committed ${change} change`, async () => {
      const db = getDb()
      if (change === "revoked") {
        signInAs("owner")
        await sharePaste("ordinary", "reader", "view")
        await db.update(paste).set({ visibility: "private" }).where(eq(paste.slug, "ordinary"))
        signInAs("reader")
      }
      const locked = deferred()
      const release = deferred()
      const writer = db.transaction(async (tx) => {
        await tx.select().from(paste).where(eq(paste.slug, "ordinary")).for("update")
        locked.resolve()
        await release.promise
        if (change === "revoked") await tx.delete(pasteShare)
        else
          await tx
            .update(paste)
            .set(
              change === "burn"
                ? { burnAfterRead: true }
                : change === "private"
                  ? { visibility: "private" }
                  : change === "moderated"
                    ? { moderationState: "removed" }
                    : { passwordHash: "changed-password-hash" },
            )
            .where(eq(paste.slug, "ordinary"))
      })
      await locked.promise
      const reader = visit()
      try {
        await waitForBlockedReader()
      } finally {
        release.resolve()
        await writer
      }
      const result = await reader
      expect(result.status).toBe(
        change === "burn" ? "sealed" : change === "password" ? "locked" : "missing",
      )
      expect(await pending()).toEqual([])
      expect((await pasteRow("ordinary"))?.views).toBe(0)
    })
  }

  test("a current password unlock and private invitation still authorize counted reads", async () => {
    await seedPaste({ slug: "password", owner: "owner", password: "secret" })
    expect((await visit("password")).status).toBe("locked")
    await unlock("password")
    expect((await visit("password")).status).toBe("ok")
    signInAs("owner")
    await seedPaste({ slug: "private", owner: "owner", visibility: "private" })
    await sharePaste("private", "reader", "view")
    signInAs("reader")
    expect((await visit("private")).status).toBe("ok")
    expect(await pending()).toHaveLength(2)
  })

  test("one explicit burn winner stays synchronous and is never queued", async () => {
    await seedPaste({ slug: "burn", owner: "owner", burnAfterRead: true })
    const results = await Promise.all(
      Array.from({ length: 20 }, () => readSharedPaste("burn", { reveal: true, visit: true })),
    )
    expect(results.filter(({ status }) => status === "ok")).toHaveLength(1)
    expect((await pasteRow("burn"))?.views).toBe(1)
    expect(await viewDayTotal("burn")).toBe(1)
    expect(await pending()).toEqual([])
    await drainVisits()
    expect((await pasteRow("burn"))?.views).toBe(1)
    expect((await getDb().select().from(notification)).map(({ kind }) => kind)).toEqual(["burned"])
  })

  test("a read waiting on a file mutation returns coherent current metadata and files", async () => {
    const locked = deferred()
    const release = deferred()
    const writer = getDb().transaction(async (tx) => {
      const [record] = await tx.select().from(paste).where(eq(paste.slug, "ordinary")).for("update")
      if (!record) throw new Error("missing paste")
      await tx.update(paste).set({ title: "new title" }).where(eq(paste.id, record.id))
      locked.resolve()
      await release.promise
      await tx
        .update(pasteFile)
        .set({ content: "new content" })
        .where(eq(pasteFile.pasteId, record.id))
    })
    await locked.promise
    const reader = visit()
    try {
      await waitForBlockedReader()
    } finally {
      release.resolve()
      await writer
    }
    const result = await reader
    expect(result.status).toBe("ok")
    if (result.status === "ok") {
      expect(result.paste.title).toBe("new title")
      expect(result.paste.files[0]?.content).toBe("new content")
    }
  })
})
