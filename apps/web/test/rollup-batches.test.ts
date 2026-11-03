import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { analyticsRollup, pasteEvent, pasteStatsDay } from "@workspace/db/schema"
import { sql } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { getAnalyticsReport } from "@/lib/pastes/analytics-report"
import { rollUpAnalytics } from "@/lib/pastes/rollup"
import { DAY } from "@/lib/time"
import { hasDatabase, resetDatabase, seedPaste, seedUser, signInAs } from "./harness"

const describeDb = hasDatabase ? describe : describe.skip
const now = Date.UTC(2026, 9, 12, 15, 30)
const today = Math.floor(now / DAY)

describeDb("bounded analytics rollup", () => {
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("rollup-owner")
    const { id } = await seedPaste({ slug: "rollup", owner: "rollup-owner" })
    await getDb()
      .insert(pasteEvent)
      .values(
        [4, 3, 2, 1, 0].map((back) => ({
          pasteId: id,
          at: new Date(now - back * DAY),
          kind: "view" as const,
          visitor: `visitor-${back}`,
          device: "desktop",
        })),
      )
    signInAs("rollup-owner")
  })
  afterAll(resetDatabase)

  test("committed daily history survives a failed pruning batch", async () => {
    const before = await getAnalyticsReport({ range: "7d" }, now)
    await getDb().execute(sql`
      CREATE FUNCTION wrk101_refuse_prune() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'pruning interrupted'; END $$`)
    await getDb().execute(sql`
      CREATE TRIGGER wrk101_refuse_prune BEFORE DELETE ON paste_event
      FOR EACH STATEMENT EXECUTE FUNCTION wrk101_refuse_prune()`)
    try {
      await expect(rollUpAnalytics(new Date(now))).rejects.toThrow()
      expect((await getDb().select().from(analyticsRollup))[0]?.finalizedDay).toBe(today - 1)
      expect(await getDb().select().from(pasteStatsDay)).toHaveLength(5)
      expect(await getDb().select().from(pasteEvent)).toHaveLength(5)
      expect(await getAnalyticsReport({ range: "7d" }, now)).toEqual(before)
    } finally {
      await getDb().execute(sql`DROP TRIGGER wrk101_refuse_prune ON paste_event`)
      await getDb().execute(sql`DROP FUNCTION wrk101_refuse_prune()`)
    }
    expect(await rollUpAnalytics(new Date(now))).toMatchObject({ removed: 2 })
    expect(await getAnalyticsReport({ range: "7d" }, now)).toEqual(before)
  })

  test("a time-limited catch-up publishes only completed days and resumes later", async () => {
    const previous = process.env.ANALYTICS_ROLLUP_TIME_BUDGET_MS
    process.env.ANALYTICS_ROLLUP_TIME_BUDGET_MS = "100"
    const before = await getAnalyticsReport({ range: "7d" }, now)
    await getDb().execute(sql`
      CREATE FUNCTION wrk101_pause_rollup() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_sleep(0.15); RETURN NEW; END $$`)
    await getDb().execute(sql`
      CREATE TRIGGER wrk101_pause_rollup BEFORE INSERT ON paste_stats_day
      FOR EACH ROW EXECUTE FUNCTION wrk101_pause_rollup()`)
    try {
      expect(await rollUpAnalytics(new Date(now))).toEqual({ days: 1, removed: 0 })
      expect((await getDb().select().from(analyticsRollup))[0]?.finalizedDay).toBe(today - 4)
      expect(await getDb().select().from(pasteEvent)).toHaveLength(5)
      expect(await getAnalyticsReport({ range: "7d" }, now)).toEqual(before)
    } finally {
      if (previous === undefined) delete process.env.ANALYTICS_ROLLUP_TIME_BUDGET_MS
      else process.env.ANALYTICS_ROLLUP_TIME_BUDGET_MS = previous
      await getDb().execute(sql`DROP TRIGGER wrk101_pause_rollup ON paste_stats_day`)
      await getDb().execute(sql`DROP FUNCTION wrk101_pause_rollup()`)
    }
    expect(await rollUpAnalytics(new Date(now))).toEqual({ days: 4, removed: 2 })
    expect(await getAnalyticsReport({ range: "7d" }, now)).toEqual(before)
  })
})
