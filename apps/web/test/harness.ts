import path from "node:path"
import { migrateDb } from "@workspace/db/migrate"
import {
  authRateLimit,
  paste,
  pasteFile,
  pasteStar,
  pasteViewDay,
  rateLimit,
  user,
} from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { hashPassword } from "@/lib/pastes/passwords"
import { unlockCookieName, unlockToken } from "@/lib/pastes/unlock"
import { request } from "./request"

// Tests run the store against a real Postgres (TEST_DATABASE_URL), because the rules they check
// live in SQL: who can read a row, and which of several concurrent readers gets it. Only the
// session and the request cookies are faked. Start a database with `docker compose up -d db`,
// create a `sniptide_test` database in it, then
//   TEST_DATABASE_URL=postgres://sniptide:sniptide@localhost:5432/sniptide_test bun run test

export const testDatabaseUrl = process.env.TEST_DATABASE_URL
export const hasDatabase = Boolean(testDatabaseUrl)

// The tests empty the tables, so refuse anything that isn't obviously a throwaway database.
if (testDatabaseUrl && !/_test(\?|$)/.test(testDatabaseUrl)) {
  throw new Error("TEST_DATABASE_URL must point at a database whose name ends in _test.")
}
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl

export { request }

export function signInAs(id: string | null) {
  request.viewer = id
}

export async function migrate() {
  await migrateDb(getDb(), path.join(import.meta.dir, "../../../packages/db/migrations"))
}

export async function resetDatabase() {
  // Everything else cascades from the accounts.
  await getDb().delete(user)
  await getDb().delete(rateLimit)
  await getDb().delete(authRateLimit)
  request.viewer = null
  request.cookies.clear()
}

export async function seedUser(id: string) {
  await getDb()
    .insert(user)
    .values({ id, name: id, email: `${id}@example.com` })
  return id
}

interface SeedPaste {
  slug: string
  owner: string
  title?: string
  content?: string
  visibility?: "public" | "unlisted" | "private"
  password?: string
  burnAfterRead?: boolean
  allowRaw?: boolean
  expiresAt?: Date
  deletedAt?: Date
}

export const marker = (slug: string) => `secret-body-of-${slug}`

export async function seedPaste(input: SeedPaste) {
  const db = getDb()
  const id = crypto.randomUUID()
  await db.insert(paste).values({
    id,
    slug: input.slug,
    ownerId: input.owner,
    title: input.title ?? `title-of-${input.slug}`,
    visibility: input.visibility ?? "unlisted",
    passwordHash: input.password ? await hashPassword(input.password) : null,
    burnAfterRead: input.burnAfterRead ?? false,
    allowRaw: input.allowRaw ?? true,
    expiresAt: input.expiresAt ?? null,
    deletedAt: input.deletedAt ?? null,
  })
  await db.insert(pasteFile).values({
    pasteId: id,
    position: 0,
    name: "a.txt",
    language: "text",
    content: input.content ?? marker(input.slug),
  })
  return { id, slug: input.slug }
}

export async function unlock(slug: string) {
  const [row] = await getDb().select().from(paste).where(eq(paste.slug, slug))
  if (!row?.passwordHash) throw new Error(`${slug} has no password`)
  request.cookies.set(unlockCookieName(slug), await unlockToken(slug, row.passwordHash))
}

export async function starCount() {
  return (await getDb().select().from(pasteStar)).length
}

export async function pasteRow(slug: string) {
  const [row] = await getDb().select().from(paste).where(eq(paste.slug, slug))
  return row
}

export async function viewDayTotal(slug: string) {
  const row = await pasteRow(slug)
  if (!row) return 0
  const days = await getDb().select().from(pasteViewDay).where(eq(pasteViewDay.pasteId, row.id))
  return days.reduce((total, day) => total + day.views, 0)
}
