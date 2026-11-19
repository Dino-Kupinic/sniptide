import { describe, expect, test } from "bun:test"
import { createDb } from "@workspace/db"
import { sql } from "drizzle-orm"
import { pgTable, timestamp } from "drizzle-orm/pg-core"
import { validateTestDatabaseUrl } from "./database-url"

const url = process.env.TEST_DATABASE_URL
const describeDb = url ? describe : describe.skip
const timestamps = pgTable("driver_timestamps", {
  authTime: timestamp("auth_time").notNull(),
  pasteTime: timestamp("paste_time", { withTimezone: true }).notNull(),
})

describeDb("Postgres.js timestamp compatibility", () => {
  test("Drizzle round-trips auth and paste dates in a non-UTC session", async () => {
    if (!url) throw new Error("TEST_DATABASE_URL is required")
    const db = createDb(validateTestDatabaseUrl(url))
    const instant = new Date("2026-03-29T01:30:00.123Z")
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`set local time zone 'Pacific/Honolulu'`)
        await tx.execute(sql`create temporary table driver_timestamps (
          auth_time timestamp not null, paste_time timestamptz not null
        ) on commit drop`)
        await tx.insert(timestamps).values({ authTime: instant, pasteTime: instant })
        const [row] = await tx.select().from(timestamps)
        expect(row?.authTime.toISOString()).toBe(instant.toISOString())
        expect(row?.pasteTime.toISOString()).toBe(instant.toISOString())
        await tx.update(timestamps).set({ authTime: new Date(instant.getTime() + 1000) })
        const [updated] = await tx.select().from(timestamps)
        expect(updated?.authTime.getTime()).toBe(instant.getTime() + 1000)
      })
    } finally {
      await db.$client.end()
    }
  })
})
