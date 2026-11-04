import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { paste } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { saveDashboardLayout } from "@/lib/dashboard/actions"
import { cleanLayout, DEFAULT_LAYOUT, TEMPLATES } from "@/lib/dashboard/widgets"
import { getDb } from "@/lib/db"
import { getDashboardData } from "@/lib/pastes/dashboard"
import { readPreferences } from "@/lib/preference-store"
import { parsePreferences } from "@/lib/preferences-schema"
import { DAY } from "@/lib/time"
import { hasDatabase, resetDatabase, seedPaste, seedUser, signInAs } from "./harness"

const testDb = hasDatabase ? test : test.skip

describe("dashboard layout", () => {
  test("keeps known widgets once each, in order", () => {
    expect(cleanLayout(["starred", "nope", "agents", "starred", 3])).toEqual(["starred", "agents"])
  })

  test("a stored layout survives parsing, and a missing one means the default template", () => {
    expect(parsePreferences(JSON.stringify({ dashboard: ["secrets", "bogus"] })).dashboard).toEqual(
      ["secrets"],
    )
    expect(parsePreferences(JSON.stringify({ dashboard: [] })).dashboard).toEqual([])
    expect(parsePreferences(JSON.stringify({ dashboard: "agents" })).dashboard).toBeUndefined()
    expect(parsePreferences("{}").dashboard).toBeUndefined()
    expect(DEFAULT_LAYOUT).toEqual(TEMPLATES.agents)
  })
})

describe("dashboard widgets", () => {
  beforeEach(async () => {
    if (!hasDatabase) return
    await resetDatabase()
    await seedUser("owner")
    await seedUser("other")
    signInAs("owner")
  })

  afterAll(() => signInAs(null))

  testDb("saves a layout per account and refuses unknown widgets", async () => {
    expect(await saveDashboardLayout(["secrets", "recent_pastes"])).toEqual({ ok: true })
    expect((await readPreferences("owner")).dashboard).toEqual(["secrets", "recent_pastes"])
    expect((await readPreferences("other")).dashboard).toBeUndefined()

    expect((await saveDashboardLayout(["secrets", "unknown"])).ok).toBe(false)
    expect((await saveDashboardLayout(["secrets", "secrets"])).ok).toBe(false)
    expect((await saveDashboardLayout("agents")).ok).toBe(false)
    expect((await readPreferences("owner")).dashboard).toEqual(["secrets", "recent_pastes"])

    expect(await saveDashboardLayout([])).toEqual({ ok: true })
    expect((await readPreferences("owner")).dashboard).toEqual([])

    signInAs(null)
    expect((await saveDashboardLayout(["agents"])).ok).toBe(false)
  })

  testDb("loads rows only for the widgets on the layout", async () => {
    await seedPaste({ slug: "mine", owner: "owner" })
    const data = await getDashboardData("en", ["recent_pastes"])
    expect(data.recent?.map((row) => row.slug)).toEqual(["mine"])
    expect(data.starred).toBeUndefined()
    expect(data.expiring).toBeUndefined()
    expect(data.popular).toBeUndefined()
    expect(data.secrets).toBeUndefined()
    expect(data.collections).toBeUndefined()

    const empty = await getDashboardData("en", [])
    expect(empty.recent).toBeUndefined()
    expect(empty.expiringSoon).toBe(0)
  })

  testDb("lists live expiring links soonest first and the most viewed pastes", async () => {
    const now = Date.now()
    await seedPaste({ slug: "later", owner: "owner", expiresAt: new Date(now + 5 * DAY) })
    await seedPaste({ slug: "soon", owner: "owner", expiresAt: new Date(now + DAY) })
    await seedPaste({ slug: "gone", owner: "owner", expiresAt: new Date(now - DAY) })
    await seedPaste({ slug: "theirs", owner: "other", expiresAt: new Date(now + DAY) })
    await seedPaste({ slug: "quiet", owner: "owner" })
    await getDb().update(paste).set({ views: 40 }).where(eq(paste.slug, "later"))
    await getDb().update(paste).set({ views: 90 }).where(eq(paste.slug, "quiet"))
    await getDb().update(paste).set({ views: 500 }).where(eq(paste.slug, "theirs"))

    const data = await getDashboardData("en", ["expiring", "popular"])
    expect(data.expiring?.map((row) => row.slug)).toEqual(["soon", "later"])
    expect(data.popular?.map((row) => row.slug)).toEqual(["quiet", "later"])
  })

  testDb("the starred widget shows what the viewer starred", async () => {
    await seedPaste({ slug: "liked", owner: "other", visibility: "public" })
    await seedPaste({ slug: "skipped", owner: "other", visibility: "public" })
    const { setStarred } = await import("@/lib/pastes/store")
    await setStarred("liked", true)
    const data = await getDashboardData("en", ["starred", "collections", "secrets"])
    expect(data.starred?.map((row) => row.slug)).toEqual(["liked"])
    expect(data.collections).toEqual([])
    expect(data.secrets).toEqual([])
  })
})
