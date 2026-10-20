import { describe, expect, test } from "bun:test"
import { sql } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { hasDatabase } from "./harness"

const describeDb = hasDatabase ? describe : describe.skip

describeDb("paste version migration", () => {
  test("preserves timestamp draft tokens for existing pastes and initializes new pastes", async () => {
    const migration = await Bun.file(
      new URL(
        "../../../packages/db/migrations/20261019205307_paste_version/migration.sql",
        import.meta.url,
      ),
    ).text()
    await getDb().transaction(async (tx) => {
      await tx.execute(
        sql`CREATE TEMP TABLE paste (updated_at timestamptz NOT NULL) ON COMMIT DROP`,
      )
      await tx.execute(sql`INSERT INTO paste VALUES ('2026-10-01T12:34:56.123999Z')`)
      for (const statement of migration.split("--> statement-breakpoint")) {
        await tx.execute(sql.raw(statement))
      }
      const [existing] = await tx.execute<{ version: number }>(
        sql`SELECT version::float8 AS version FROM paste`,
      )
      expect(existing?.version).toBe(new Date("2026-10-01T12:34:56.123Z").getTime())
      const [created] = await tx.execute<{ version: number; now: number }>(sql`
        INSERT INTO paste (updated_at) VALUES ('2020-01-01T00:00:00Z')
        RETURNING version::float8 AS version, floor(extract(epoch from clock_timestamp()) * 1000)::float8 AS now
      `)
      expect(created?.version).toBeGreaterThan(new Date("2020-01-01T00:00:00Z").getTime())
      expect(Math.abs((created?.version ?? 0) - (created?.now ?? 0))).toBeLessThan(1000)
    })
  })
})
