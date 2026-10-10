import path from "node:path"
import { createDb } from "@workspace/db"
import { migrateDb } from "@workspace/db/migrate"
import { hashPassword } from "better-auth/crypto"
import { sql } from "drizzle-orm"

const url = process.env.LOAD_DATABASE_URL
if (!url || !new URL(url).pathname.endsWith("_loadtest"))
  throw new Error("LOAD_DATABASE_URL must name a dedicated database ending in _loadtest")
const password = process.env.LOAD_PASSWORD
if (!password || password.length < 12) throw new Error("Set LOAD_PASSWORD (at least 12 characters)")
const count = Number(process.env.LOAD_PASTE_COUNT ?? 100000)
if (!Number.isSafeInteger(count) || count < 1000 || count > 1000000)
  throw new Error("LOAD_PASTE_COUNT must be between 1000 and 1000000")
const directory = process.env.LOAD_ARTIFACT_DIR ?? path.join(import.meta.dir, "artifacts")
const db = createDb(url)
const ownerCount = 40
const whaleCount = Math.min(10000, Math.floor(count / 2))
const id = (index: number) => `load-owner-${index}`
const slug = (index: number) => `load-${String(index).padStart(7, "0")}`
const hash = await hashPassword(password)
try {
  await migrateDb(db, path.join(import.meta.dir, "../../../packages/db/migrations"))
  // Never reset arbitrary data, even in a database with the required suffix.
  const [existing] = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from "user"`,
  )
  if (existing?.count)
    throw new Error("Seed requires an empty user table; create a fresh load-test database")
  await db.transaction(async (tx) => {
    for (let index = 0; index < ownerCount; index++) {
      await tx.execute(sql`insert into "user" (id, name, email, email_verified) values
        (${id(index)}, ${`Load user ${index}`}, ${`load-${index}@example.invalid`}, true)`)
      if (index < 2)
        await tx.execute(sql`insert into account (id, account_id, provider_id, user_id, password)
          values (${`load-account-${index}`}, ${id(index)}, 'credential', ${id(index)}, ${hash})`)
      await tx.execute(
        sql`insert into collection (owner_id, slug, name) values (${id(index)}, 'notes', 'Load notes')`,
      )
    }
  })
  const started = Date.now()
  for (let start = 0; start < count; start += 500) {
    const end = Math.min(count - 1, start + 499)
    await db.transaction(async (tx) => {
      await tx.execute(sql`insert into paste (id, slug, owner_id, title, description, visibility, collection, created_at, updated_at, deleted_at, expires_at)
        select md5('sniptide-load-' || i)::uuid, 'load-' || lpad(i::text, 7, '0'),
          'load-owner-' || case when i < ${whaleCount} then 0 else 1 + ((i - ${whaleCount}) % ${ownerCount - 1}) end,
          'Load fixture ' || lpad(i::text, 7, '0'), 'Synthetic load-test fixture',
          (case when i % 20 < 10 then 'public' when i % 20 < 17 then 'unlisted' else 'private' end)::visibility,
          case when i % 5 = 0 then 'notes' else null end,
          '2026-01-01'::timestamptz + i * interval '1 second',
          '2026-01-01'::timestamptz + i * interval '1 second',
          case when i % 50 = 49 then now() - interval '1 day' else null end,
          case when i % 50 = 48 then now() - interval '1 day' when i % 10 = 7 then now() + interval '30 days' else null end
        from generate_series(${start}::int, ${end}::int) i`)
      await tx.execute(sql`insert into paste_file (paste_id, position, name, language, content)
        select md5('sniptide-load-' || i)::uuid, 0, 'snippet.ts', 'typescript',
          '/* load-fixture:load-' || lpad(i::text, 7, '0') || E' */\n' ||
          repeat('export const item' || i || ' = "' || md5(i::text) || E'";\n',
            case when i % 1000 = 0 then 2600 when i % 100 = 1 then 850 when i % 10 < 3 then 110 else 14 end)
        from generate_series(${start}::int, ${end}::int) i`)
      await tx.execute(sql`insert into paste_file (paste_id, position, name, language, content)
        select md5('sniptide-load-' || i)::uuid, 1, 'helper.py', 'python', '# secondary load fixture'
        from generate_series(${start}::int, ${end}::int) i where i % 10 = 1`)
      await tx.execute(sql`insert into paste_revision (paste_id, message, created_at)
        select md5('sniptide-load-' || i)::uuid, 'Load edit ' || revision,
          '2026-01-01'::timestamptz + revision * interval '1 minute'
        from generate_series(${start}::int, ${end}::int) i cross join generate_series(1, 45) revision where i % 100 = 0`)
      await tx.execute(sql`insert into paste_view_day (paste_id, day, views)
        select md5('sniptide-load-' || i)::uuid, floor(extract(epoch from now()) / 86400)::int - age, 1 + i % 10
        from generate_series(${start}::int, ${end}::int) i cross join generate_series(0, 89) age where i % 100 = 0`)
      await tx.execute(sql`insert into paste_star (user_id, paste_id)
        select 'load-owner-0', md5('sniptide-load-' || i)::uuid
        from generate_series(${start}::int, ${end}::int) i where i % 100 = 0`)
    })
    if ((end + 1) % 10000 === 0) console.info(`Seeded ${end + 1}/${count}`)
  }
  await db.execute(
    sql`update paste set views = 90 where slug like 'load-%' and substring(slug from 6)::int % 100 = 0`,
  )
  await db.execute(sql`analyze paste`)
  await db.execute(sql`analyze paste_file`)
  await db.execute(sql`analyze paste_star`)
  await db.execute(sql`analyze paste_view_day`)
  const [totals] = await db.execute(
    sql`select count(*)::int as pastes, sum(bytes)::float8 as content_bytes, pg_database_size(current_database())::float8 as database_bytes from paste`,
  )
  const publicPastes = Array.from({ length: Math.min(128, Math.floor(count / 50)) }, (_, i) =>
    slug(Math.floor(i / 10) * 100 + (i % 10)),
  )
  await Bun.write(
    path.join(directory, "manifest.json"),
    JSON.stringify(
      {
        version: 1,
        count,
        ownerCount,
        whaleCount,
        totals,
        seedMs: Date.now() - started,
        publicPastes,
        hotPaste: slug(50),
        email: "load-0@example.invalid",
        normalEmail: "load-1@example.invalid",
        collection: "notes",
      },
      null,
      2,
    ),
  )
  console.info(`Seed complete. Manifest: ${path.join(directory, "manifest.json")}`)
} finally {
  await db.$client.end()
}
