import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import path from "node:path"
import { migrateDb } from "@workspace/db/migrate"
import { accountUsage, apiTokenUsageDay, user } from "@workspace/db/schema"
import { eq, inArray } from "drizzle-orm"
import {
  type AccountRow,
  listAccountUsage,
  nearLimit,
  sharesOf,
  sortAccounts,
  TOKEN_DAILY_CEILING,
} from "@/lib/accounts"
import { getConfig } from "@/lib/config"
import { getDb } from "@/lib/db"
import { digestDue, isoWeek, sendLimitsDigest } from "@/lib/digest"
import { formatBytes, percent } from "@/lib/format"
import { setResendClientForTests } from "@/lib/store"

const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (testDatabaseUrl && !/\/[A-Za-z0-9_-]+_test(\?.*)?$/.test(testDatabaseUrl))
  throw new Error("TEST_DATABASE_URL must name a database ending in _test.")
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl
const describeDb = testDatabaseUrl ? describe : describe.skip

const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "postgres://localhost/admin_test",
  RESEND_API_KEY: "re_test",
  RESEND_SEGMENT_ID: "seg_1",
  BROADCAST_FROM: "Sniptide <updates@example.com>",
  BROADCAST_TEST_TO: "writer@example.com",
  APP_URL: "https://app.example.com",
  ADMIN_PASSWORD: "a-long-operator-password",
  RESEND_TOPIC_UPDATES: "top_update",
  RESEND_TOPIC_SURVEYS: "top_survey",
  RESEND_TOPIC_GUIDES: "top_guide",
}
const MB = 1024 ** 2
const limits = { bytes: 100 * MB, pastes: 1000 }

function row(id: string, storageBytes: number, pasteCount: number, apiPeakDay: number): AccountRow {
  const usage = { storageBytes, pasteCount, apiPeakDay }
  return {
    id,
    name: id,
    email: `${id}@example.com`,
    createdAt: new Date(0),
    ...usage,
    shares: sharesOf(usage, limits),
  }
}

describe("account limits", () => {
  test("measure each figure against its limit", () => {
    expect(row("a", 90 * MB, 100, TOKEN_DAILY_CEILING / 2).shares).toEqual({
      storage: 0.9,
      pastes: 0.1,
      api: 0.5,
    })
    expect(
      sharesOf({ storageBytes: 5, pasteCount: 5, apiPeakDay: 0 }, { bytes: null, pastes: null }),
    ).toEqual({
      storage: null,
      pastes: null,
      api: 0,
    })
  })

  test("sort by the chosen share in either direction", () => {
    const rows = [row("a", 10 * MB, 900, 0), row("b", 80 * MB, 10, 0), row("c", 50 * MB, 500, 0)]
    expect(sortAccounts(rows, "storage", "desc").map((r) => r.id)).toEqual(["b", "c", "a"])
    expect(sortAccounts(rows, "pastes", "desc").map((r) => r.id)).toEqual(["a", "c", "b"])
    expect(sortAccounts(rows, "storage", "asc").map((r) => r.id)).toEqual(["a", "c", "b"])
    expect(sortAccounts(rows, "share", "desc").map((r) => r.id)).toEqual(["a", "b", "c"])
  })

  test("count an account as near a limit from 80% of any one", () => {
    const rows = [
      row("calm", 79 * MB, 799, 0),
      row("storage", 80 * MB, 0, 0),
      row("pastes", 0, 800, 0),
      row("api", 0, 0, TOKEN_DAILY_CEILING * 0.8),
    ]
    expect(nearLimit(rows).map((r) => r.id)).toEqual(["storage", "pastes", "api"])
  })

  test("read the app's limits from the same variables", () => {
    expect(getConfig(env).limits).toEqual({ bytes: 100 * MB, pastes: 1000 })
    expect(
      getConfig({ ...env, ACCOUNT_STORAGE_BYTES: "1.5GB", ACCOUNT_PASTE_LIMIT: "unlimited" })
        .limits,
    ).toEqual({ bytes: 1.5 * 1024 * MB, pastes: null })
    expect(() => getConfig({ ...env, ACCOUNT_PASTE_LIMIT: "lots" })).toThrow("ACCOUNT_PASTE_LIMIT")
    expect(getConfig(env).digestTo).toBe("writer@example.com")
    expect(getConfig({ ...env, DIGEST_TO: "ops@example.com" }).digestTo).toBe("ops@example.com")
  })

  test("format sizes and shares", () => {
    expect(formatBytes(512)).toBe("512 B")
    expect(formatBytes(84.25 * MB)).toBe("84.3 MB")
    expect(formatBytes(100 * MB)).toBe("100 MB")
    expect(percent(0.836)).toBe("84%")
  })
})

describe("digest schedule", () => {
  test("is due during 08:00 UTC on Mondays", () => {
    expect(digestDue(new Date("2026-11-30T08:10:00Z"))).toBe(true)
    expect(digestDue(new Date("2026-11-30T09:00:00Z"))).toBe(false)
    expect(digestDue(new Date("2026-11-26T08:10:00Z"))).toBe(false)
  })

  test("names ISO weeks", () => {
    expect(isoWeek(new Date("2026-11-30T08:00:00Z"))).toBe("2026-W49")
    expect(isoWeek(new Date("2027-01-01T00:00:00Z"))).toBe("2026-W53")
    expect(isoWeek(new Date("2026-01-01T00:00:00Z"))).toBe("2026-W01")
  })
})

describeDb("account usage", () => {
  const ids = ["heavy", "light", "agent"]
  const sent: { to: string; subject: string; text: string; idempotencyKey?: string }[] = []
  const monday = new Date("2026-11-30T08:05:00Z")
  const today = Math.floor(monday.getTime() / 86_400_000)

  beforeAll(async () => {
    Object.assign(process.env, env)
    await migrateDb(getDb(), path.join(import.meta.dir, "../../../packages/db/migrations"))
  })
  beforeEach(async () => {
    Object.assign(process.env, env)
    sent.length = 0
    await getDb().delete(user).where(inArray(user.id, ids))
    await getDb()
      .insert(user)
      .values(ids.map((id) => ({ id, name: id, email: `${id}@example.com` })))
    // A trigger creates each account's usage row when the user is inserted.
    await getDb()
      .update(accountUsage)
      .set({ storageBytes: 95 * MB, pasteCount: 120 })
      .where(eq(accountUsage.ownerId, "heavy"))
    await getDb()
      .update(accountUsage)
      .set({ storageBytes: 1 * MB, pasteCount: 3 })
      .where(eq(accountUsage.ownerId, "light"))
    const token = crypto.randomUUID()
    await getDb()
      .insert(apiTokenUsageDay)
      .values([
        { ownerId: "agent", tokenId: token, day: today, requests: 80_000 },
        // Outside the seven-day window.
        { ownerId: "light", tokenId: token, day: today - 10, requests: 86_000 },
      ])
    setResendClientForTests({
      subscribe: async () => {},
      unsubscribe: async () => {},
      remove: async () => {},
      setTopics: async () => {},
      createBroadcast: async () => "bc",
      sendBroadcast: async () => {},
      sendEmail: async (input) => {
        sent.push(input)
      },
    })
  })
  afterEach(async () => {
    setResendClientForTests(undefined)
    await getDb().delete(user).where(inArray(user.id, ids))
  })

  test("reads storage, pastes and the busiest token-day in the last week", async () => {
    const rows = (await listAccountUsage(monday)).filter((r) => ids.includes(r.id))
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
    expect(byId.heavy).toMatchObject({ storageBytes: 95 * MB, pasteCount: 120, apiPeakDay: 0 })
    expect(byId.light).toMatchObject({ apiPeakDay: 0 })
    expect(byId.agent).toMatchObject({ storageBytes: 0, pasteCount: 0, apiPeakDay: 80_000 })
    expect(
      nearLimit(rows)
        .map((r) => r.id)
        .sort(),
    ).toEqual(["agent", "heavy"])
  })

  test("emails the operator once a week with only the accounts near a limit", async () => {
    expect(await sendLimitsDigest(new Date("2026-11-26T08:05:00Z"))).toBe("not_due")
    expect(await sendLimitsDigest(monday)).toBe("sent")
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      to: "writer@example.com",
      idempotencyKey: `limits-digest-${isoWeek(monday)}`,
    })
    expect(sent[0]?.text).toContain("heavy@example.com")
    expect(sent[0]?.text).toContain("agent@example.com")
    expect(sent[0]?.text).not.toContain("light@example.com")
  })

  test("sends nothing when every account is comfortably within its limits", async () => {
    await getDb()
      .delete(user)
      .where(inArray(user.id, ["heavy", "agent"]))
    const others = nearLimit(await listAccountUsage(monday))
    if (others.length === 0) expect(await sendLimitsDigest(monday)).toBe("nothing_to_report")
  })
})
