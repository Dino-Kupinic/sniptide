import { describe, expect, test } from "bun:test"
import path from "node:path"
import { createDb } from "@workspace/db"
import { MIGRATION_LOCK, migrateDb } from "@workspace/db/migrate"
import { hasDatabase, testDatabaseUrl } from "./harness"

const describeDb = hasDatabase ? describe : describe.skip
const folder = path.join(import.meta.dir, "../../../packages/db/migrations")

describeDb("migration coordination", () => {
  test("a startup waits for another migrator and releases its lock afterward", async () => {
    if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required")
    const db = createDb(testDatabaseUrl)
    const connection = await db.$client.reserve()
    await connection`select pg_advisory_lock(${MIGRATION_LOCK})`
    let settled = false
    const migration = migrateDb(db, folder).then(() => {
      settled = true
    })
    try {
      let waiting = false
      for (let i = 0; i < 100 && !waiting; i++) {
        const [row] =
          await connection`select exists(select 1 from pg_locks where locktype = 'advisory' and objid = ${MIGRATION_LOCK} and not granted) as waiting`
        waiting = row?.waiting === true
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10))
      }
      expect(waiting).toBe(true)
      expect(settled).toBe(false)
    } finally {
      await connection`select pg_advisory_unlock(${MIGRATION_LOCK})`
      await migration
      const [row] = await connection`select pg_try_advisory_lock(${MIGRATION_LOCK}) as locked`
      expect(row?.locked).toBe(true)
      await connection`select pg_advisory_unlock(${MIGRATION_LOCK})`
      connection.release()
      await db.$client.end()
    }
  })

  test("failed migrations release the lock and transaction connection", async () => {
    if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required")
    const db = createDb(testDatabaseUrl)
    try {
      await expect(migrateDb(db, path.join(folder, "does-not-exist"))).rejects.toThrow()
      const connection = await db.$client.reserve()
      try {
        const [row] = await connection`select pg_try_advisory_lock(${MIGRATION_LOCK}) as locked`
        expect(row?.locked).toBe(true)
        await connection`select pg_advisory_unlock(${MIGRATION_LOCK})`
      } finally {
        connection.release()
      }
    } finally {
      await db.$client.end()
    }
  })
})
