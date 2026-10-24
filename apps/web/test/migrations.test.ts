import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
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

// Statements Postgres can't roll back, or won't run inside a transaction. Every pending migration
// runs in one transaction (migrateDb), so one of these would either fail every upgrade or, worse,
// leave part of a failed upgrade behind. Keep migrations to ordinary, transactional DDL and DML.
const NON_TRANSACTIONAL = [
  /\bconcurrently\b/i,
  /\balter\s+type\b[^;]*\badd\s+value\b/i,
  /^\s*(vacuum|cluster|reindex\s+(database|system)|create\s+database|drop\s+database|alter\s+system)\b/im,
  /\bcreate\s+tablespace\b/i,
]

describe("migration files", () => {
  const migrations = fs
    .readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      sql: fs.readFileSync(path.join(folder, entry.name, "migration.sql"), "utf8"),
    }))

  test("there are migrations to check", () => {
    expect(migrations.length).toBeGreaterThan(0)
  })

  for (const migration of migrations) {
    test(`${migration.name} only uses statements a transaction can roll back`, () => {
      const forbidden = NON_TRANSACTIONAL.find((pattern) => pattern.test(migration.sql))
      expect(forbidden, `${migration.name} uses a non-transactional statement`).toBeUndefined()
    })
  }
})

// A copy of the real migrations plus extra ones, in a throwaway folder.
function folderWith(extra: Record<string, string>) {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), "sniptide-migrations-"))
  fs.cpSync(folder, copy, { recursive: true })
  for (const [name, body] of Object.entries(extra)) {
    fs.mkdirSync(path.join(copy, name))
    fs.writeFileSync(path.join(copy, name, "migration.sql"), body)
  }
  return copy
}

async function onFreshDatabase(run: (db: ReturnType<typeof createDb>) => Promise<void>) {
  if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required")
  const name = `migrate_check_${process.pid}_${Date.now()}`
  const admin = createDb(testDatabaseUrl)
  await admin.$client.unsafe(`CREATE DATABASE ${name}`)
  const url = new URL(testDatabaseUrl)
  url.pathname = `/${name}`
  const db = createDb(url.toString())
  try {
    await run(db)
  } finally {
    await db.$client.end()
    await admin.$client.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
    await admin.$client.end()
  }
}

describeDb("upgrading a database", () => {
  test("a fresh database gets every migration, and a second run applies none", async () => {
    await onFreshDatabase(async (db) => {
      const first = await migrateDb(db, folder)
      expect(first.applied.length).toBe(
        fs.readdirSync(folder, { withFileTypes: true }).filter((e) => e.isDirectory()).length,
      )
      expect(first.ahead).toEqual([])
      expect(await migrateDb(db, folder)).toEqual({ applied: [], ahead: [] })
    })
  })

  test("a failing migration rolls back the ones applied with it and changes nothing", async () => {
    await onFreshDatabase(async (db) => {
      await migrateDb(db, folder)
      const recorded = () =>
        db.$client`select name from drizzle.__drizzle_migrations order by name`.then((rows) =>
          rows.map((row) => row.name),
        )
      const before = await recorded()

      // The first extra migration is valid and the second one fails, so a half-applied upgrade
      // would leave `upgrade_probe` behind.
      const broken = folderWith({
        "99990101000000_probe": 'CREATE TABLE "upgrade_probe" ("id" integer);',
        "99990101000001_boom": 'SELECT * FROM "table_that_does_not_exist";',
      })
      await expect(migrateDb(db, broken)).rejects.toThrow()

      const [probe] = await db.$client`select to_regclass('public.upgrade_probe') as found`
      expect(probe?.found).toBeNull()
      expect(await recorded()).toEqual(before)

      // And the database still upgrades once the broken migration is gone.
      const fixed = folderWith({
        "99990101000000_probe": 'CREATE TABLE "upgrade_probe" ("id" integer);',
      })
      const report = await migrateDb(db, fixed)
      expect(report.applied).toEqual(["99990101000000_probe"])
      const [after] = await db.$client`select to_regclass('public.upgrade_probe') as found`
      expect(after?.found).toBe("upgrade_probe")
    })
  })

  test("an older build reports the migrations a newer one added", async () => {
    await onFreshDatabase(async (db) => {
      const newer = folderWith({
        "99990101000000_newer": 'CREATE TABLE "from_the_future" ("id" integer);',
      })
      await migrateDb(db, newer)
      const report = await migrateDb(db, folder)
      expect(report.applied).toEqual([])
      expect(report.ahead).toEqual(["99990101000000_newer"])
    })
  })
})
