import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { accountActivityDay, instanceActivity, user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { getCapture } from "@/lib/api/pastes"
import { getConfig } from "@/lib/config"
import { getDb } from "@/lib/db"
import {
  activitySurface,
  configureActivityTracking,
  flushAccountReads,
  recordAccountActivity,
  recordAccountRead,
} from "@/lib/instance-activity"
import { sendInstanceReport } from "@/lib/instance-telemetry"
import { createPasteRecord, replacePaste } from "@/lib/pastes/mutations"
import { hasDatabase, resetDatabase, seedUser } from "./harness"

const describeDb = hasDatabase ? describe : describe.skip
const savedTelemetry = process.env.TELEMETRY
const savedSecret = process.env.BETTER_AUTH_SECRET
const originalFetch = globalThis.fetch
const DAY = 86400000
const today = Math.floor(Date.now() / DAY)
const at = (day: number) => new Date(day * DAY + 1000)

describeDb("observed account activity", () => {
  beforeEach(async () => {
    await resetDatabase()
    process.env.TELEMETRY = "on"
    process.env.BETTER_AUTH_SECRET = "a".repeat(32)
    await seedUser("first")
    await seedUser("second")
    await configureActivityTracking()
    await getDb()
      .update(instanceActivity)
      .set({ observedSinceDay: today - 40 })
  })
  afterEach(async () => {
    await flushAccountReads()
    globalThis.fetch = originalFetch
    if (savedTelemetry === undefined) delete process.env.TELEMETRY
    else process.env.TELEMETRY = savedTelemetry
    if (savedSecret === undefined) delete process.env.BETTER_AUTH_SECRET
    else process.env.BETTER_AUTH_SECRET = savedSecret
    await resetDatabase()
  })

  test("deduplicates accounts across actions, days and surfaces and excludes today from completed windows", async () => {
    for (const [owner, day, operation, surface] of [
      ["first", today - 1, "creates", "web"],
      ["first", today - 1, "reads", "cli"],
      ["first", today - 7, "edits", "mcp"],
      ["second", today - 8, "reads", "api"],
      ["second", today - 30, "creates", "web"],
      ["second", today, "reads", "web"],
    ] as const)
      await recordAccountActivity(getDb(), owner, operation, surface, at(day))
    let report: Record<string, unknown> = {}
    globalThis.fetch = (async (_url, init) => {
      report = JSON.parse(String(init?.body))
      return new Response(null, { status: 204 })
    }) as typeof fetch
    expect(await sendInstanceReport(getConfig())).toBe("completed")
    expect(report).toMatchObject({
      schema: 2,
      reportDay: today - 1,
      totalAccounts: 2,
      activeAccounts1d: 1,
      activeAccounts7d: 1,
      activeAccounts30d: 2,
      creates7d: 1,
      edits7d: 1,
      reads7d: 1,
      workflow7d: { web: 1, cli: 1, mcp: 1, api: 0 },
    })
    expect(JSON.stringify(report)).not.toContain("first")
    expect(JSON.stringify(report)).not.toContain("second")
  })

  test("counts committed mutations, rejects rolled-back activity and keeps activation after deletion", async () => {
    await expect(
      getDb().transaction(async (tx) => {
        await recordAccountActivity(tx, "first", "creates", "web", at(today - 5))
        throw new Error("rollback")
      }),
    ).rejects.toThrow("rollback")
    expect(await getDb().select().from(accountActivityDay)).toHaveLength(0)
    expect((await getDb().select().from(instanceActivity))[0]?.activationDay).toBeNull()
    await recordAccountActivity(getDb(), "first", "creates", "web", at(today - 4))
    await recordAccountActivity(getDb(), "second", "creates", "web", at(today - 1))
    expect((await getDb().select().from(instanceActivity))[0]?.activationDay).toBe(today - 4)
    await getDb().delete(user).where(eq(user.id, "first"))
    expect((await getDb().select().from(instanceActivity))[0]?.activationDay).toBe(today - 4)
  })

  test("records successful service operations but not rejected or conflicting actions", async () => {
    const input = {
      title: "Example",
      description: "",
      files: [{ name: "a.ts", language: "typescript", content: "const x = 1" }],
      visibility: "private" as const,
      collection: null,
      tags: [],
      source: null,
    }
    const created = await getDb().transaction((tx) =>
      createPasteRecord(tx, {
        kind: "capture",
        actor: { kind: "token", userId: "first" },
        input,
        origin: { via: "cli", agent: null },
      }),
    )
    await activitySurface.run("mcp", () =>
      getDb().transaction((tx) =>
        replacePaste(
          tx,
          { id: created.id },
          { kind: "capture", actor: { kind: "token", userId: "first" }, input },
        ),
      ),
    )
    await getCapture("first", created.id, { countRead: true })
    expect(await getCapture("second", created.id, { countRead: true })).toBeNull()
    expect(
      await getDb().transaction((tx) =>
        replacePaste(
          tx,
          { id: created.id },
          { kind: "capture", actor: { kind: "token", userId: "second" }, input },
        ),
      ),
    ).toBeNull()
    await flushAccountReads()
    const rows = await getDb().select().from(accountActivityDay)
    expect(rows.map((r) => r.surface).sort()).toEqual(["api", "cli", "mcp"])
    expect(rows.reduce((n, r) => n + r.creates + r.edits + r.reads, 0)).toBe(3)
  })

  test("opt-out skips writes, and reenabling starts a new observation window", async () => {
    process.env.TELEMETRY = "off"
    await configureActivityTracking()
    await recordAccountActivity(getDb(), "first", "reads", "web")
    expect(await getDb().select().from(accountActivityDay)).toHaveLength(0)
    process.env.TELEMETRY = "on"
    await configureActivityTracking()
    expect((await getDb().select().from(instanceActivity))[0]).toMatchObject({
      tracking: true,
      observedSinceDay: today,
    })
  })

  test("buffers reads without writing synchronously and preserves request workflow", async () => {
    activitySurface.run("mcp", () => recordAccountRead("first"))
    activitySurface.run("cli", () => recordAccountRead("first"))
    expect(await getDb().select().from(accountActivityDay)).toHaveLength(0)
    await flushAccountReads()
    const rows = await getDb().select().from(accountActivityDay)
    expect(rows.map((r) => r.surface).sort()).toEqual(["cli", "mcp"])
    expect(rows.every((r) => r.reads === 1)).toBe(true)
  })
})
