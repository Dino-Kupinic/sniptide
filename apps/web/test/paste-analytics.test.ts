import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import {
  analyticsRollup,
  analyticsSalt,
  collection,
  paste,
  pasteBreakdownDay,
  pasteEvent,
  pasteStatsDay,
} from "@workspace/db/schema"
import { eq, sql } from "drizzle-orm"
import { POST as copyRoute } from "@/app/[slug]/copy/route"
import SharePage from "@/app/[slug]/page"
import { GET as rawRoute } from "@/app/[slug]/raw/route"
import { POST as revealRoute } from "@/app/[slug]/reveal/route"
import { GET as statsRoute } from "@/app/api/stats/route"
import { getDb } from "@/lib/db"
import { analyticsCsv } from "@/lib/pastes/analytics-csv"
import { getAnalyticsReport, getAnalyticsSeries } from "@/lib/pastes/analytics-report"
import { type EventKind, recordPasteEvent } from "@/lib/pastes/events"
import { rollUpAnalytics } from "@/lib/pastes/rollup"
import { telemetrySnapshot } from "@/lib/telemetry"
import { DAY, HOUR } from "@/lib/time"
import {
  hasDatabase,
  pasteRow,
  request,
  resetDatabase,
  seedPaste,
  seedUser,
  signInAs,
  viewDayTotal,
} from "./harness"

// Paste analytics end to end: what a request leaves behind, how the rollup folds it into days,
// and that the Analytics page and /api/stats read the same figures whether a day has been rolled
// up or not.

const describeDb = hasDatabase ? describe : describe.skip

const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
const NOW = Date.UTC(2026, 9, 12, 15, 30)
const TODAY = Math.floor(NOW / DAY)

// A visitor is an address and a browser; the tests tell addresses apart with X-Real-IP.
function browser(address: string, extra: Record<string, string> = {}) {
  return new Headers({ "user-agent": CHROME, "x-real-ip": address, ...extra })
}

async function idOf(slug: string) {
  const row = await pasteRow(slug)
  if (!row) throw new Error(`no paste ${slug}`)
  return row.id
}

async function hit(slug: string, kind: EventKind, headers: Headers, at: number = NOW) {
  await recordPasteEvent(await idOf(slug), kind, headers, at)
}

const events = () => getDb().select().from(pasteEvent).orderBy(pasteEvent.id)
const params = (slug: string) => ({ params: Promise.resolve({ slug }) }) as never
const post = (url: string) => new Request(url, { method: "POST" })

describeDb("paste analytics", () => {
  const source = process.env.CLIENT_IP_SOURCE
  beforeAll(() => {
    process.env.CLIENT_IP_SOURCE = "x-real-ip"
  })
  afterAll(async () => {
    if (source === undefined) delete process.env.CLIENT_IP_SOURCE
    else process.env.CLIENT_IP_SOURCE = source
    await resetDatabase()
  })
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
    await seedUser("other")
    await seedPaste({ slug: "pub", owner: "owner", visibility: "public", language: "typescript" })
    await seedPaste({ slug: "second", owner: "owner", visibility: "unlisted", language: "nginx" })
    await seedPaste({ slug: "priv", owner: "owner", visibility: "private" })
    await seedPaste({ slug: "theirs", owner: "other", visibility: "public" })
    signInAs("owner")
  })

  describe("recording", () => {
    test("a visit keeps a device, a referrer host and a country, and nothing that identifies", async () => {
      signInAs(null)
      request.headers = browser("203.0.113.9", {
        referer: "https://news.ycombinator.com/item?id=4242&auth=secret",
        "cf-ipcountry": "AT",
      })
      await SharePage(params("pub"))

      const [row, ...rest] = await events()
      expect(rest).toEqual([])
      expect(row).toMatchObject({
        kind: "view",
        referrer: "news.ycombinator.com",
        country: "AT",
        device: "desktop",
      })
      expect(row?.visitor).toMatch(/^[0-9a-f]{32}$/)
      const stored = JSON.stringify(row)
      for (const leaked of ["203.0.113.9", "Chrome", "item?id", "secret"]) {
        expect(stored).not.toContain(leaked)
      }
      expect(await viewDayTotal("pub")).toBe(1)
    })

    test("a phone is mobile and a direct visit has no referrer", async () => {
      signInAs(null)
      request.headers = browser("203.0.113.10", { "user-agent": IPHONE })
      await SharePage(params("pub"))
      expect((await events())[0]).toMatchObject({ device: "mobile", referrer: null, country: null })
    })

    test("a click from the app's own pages is a direct visit", async () => {
      signInAs(null)
      request.headers = browser("203.0.113.10", {
        host: "sniptide.test",
        referer: "https://sniptide.test/dashboard",
      })
      await SharePage(params("pub"))
      expect((await events())[0]?.referrer).toBeNull()
    })

    test("the owner's own visits are not recorded", async () => {
      request.headers = browser("203.0.113.9")
      await SharePage(params("pub"))
      expect(await events()).toEqual([])
    })

    test("crawlers, previews, prefetches and scripts are not views", async () => {
      signInAs(null)
      const automated: Record<string, string>[] = [
        { "user-agent": "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)" },
        { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" },
        { purpose: "prefetch" },
        { "user-agent": "curl/8.4.0" },
        { "user-agent": "" },
      ]
      for (const extra of automated) {
        request.headers = browser("203.0.113.11", extra)
        await SharePage(params("pub"))
      }
      expect(await events()).toEqual([])
      expect(await viewDayTotal("pub")).toBe(0)
    })

    test("a raw read is a raw hit; curl counts as cli and a crawler doesn't count", async () => {
      signInAs(null)
      request.headers = new Headers({ "user-agent": "curl/8.4.0", "x-real-ip": "203.0.113.12" })
      await rawRoute(new Request("http://x/pub/raw"), params("pub"))
      request.headers = browser("203.0.113.13")
      await rawRoute(new Request("http://x/pub/raw"), params("pub"))
      request.headers = new Headers({ "user-agent": "Googlebot/2.1", "x-real-ip": "66.249.66.1" })
      await rawRoute(new Request("http://x/pub/raw"), params("pub"))

      const rows = await events()
      expect(rows.map((row) => [row.kind, row.device])).toEqual([
        ["raw", "cli"],
        ["raw", "desktop"],
      ])
      expect(rows.every((row) => row.referrer === null && row.country === null)).toBe(true)
    })

    test("a raw read the paste refuses, or its owner makes, is not recorded", async () => {
      await seedPaste({ slug: "noraw", owner: "owner", visibility: "public", allowRaw: false })
      signInAs(null)
      request.headers = browser("203.0.113.14")
      await rawRoute(new Request("http://x/noraw/raw"), params("noraw"))
      await rawRoute(new Request("http://x/priv/raw"), params("priv"))
      signInAs("owner")
      await rawRoute(new Request("http://x/pub/raw"), params("pub"))
      expect(await events()).toEqual([])
    })

    test("revealing a burn-after-read paste is a view", async () => {
      await seedPaste({ slug: "burn", owner: "owner", burnAfterRead: true })
      signInAs(null)
      request.headers = browser("203.0.113.15")
      await revealRoute(post("http://x/burn/reveal"), params("burn"))
      expect((await events()).map((row) => row.kind)).toEqual(["view"])
    })

    test("a copy is recorded once per reader per ten minutes, and never for the owner", async () => {
      signInAs(null)
      request.headers = browser("203.0.113.16")
      for (let i = 0; i < 3; i++) {
        expect((await copyRoute(post("http://x/pub/copy"), params("pub"))).status).toBe(204)
      }
      request.headers = browser("203.0.113.17")
      await copyRoute(post("http://x/pub/copy"), params("pub"))
      expect((await events()).map((row) => row.kind)).toEqual(["copy", "copy"])

      // A paste the visitor can't open answers the same and records nothing.
      expect((await copyRoute(post("http://x/priv/copy"), params("priv"))).status).toBe(204)
      expect((await copyRoute(post("http://x/nope/copy"), params("nope"))).status).toBe(204)
      signInAs("owner")
      await copyRoute(post("http://x/pub/copy"), params("pub"))
      expect(await events()).toHaveLength(2)
    })

    test("a repeat copy counts again after the window", async () => {
      await hit("pub", "copy", browser("203.0.113.18"), NOW)
      await hit("pub", "copy", browser("203.0.113.18"), NOW + 5 * 60_000)
      await hit("pub", "copy", browser("203.0.113.18"), NOW + 11 * 60_000)
      expect(await events()).toHaveLength(2)
    })

    test("a visitor is the same within a day and a different one the next", async () => {
      await hit("pub", "view", browser("203.0.113.20"), NOW)
      await hit("pub", "view", browser("203.0.113.20"), NOW + HOUR)
      await hit("pub", "view", browser("203.0.113.21"), NOW)
      await hit("pub", "view", browser("203.0.113.20"), NOW + DAY)
      const [a, b, c, d] = await events()
      expect(a?.visitor).toBe(b?.visitor ?? "")
      expect(c?.visitor).not.toBe(a?.visitor ?? "")
      expect(d?.visitor).not.toBe(a?.visitor ?? "")
      expect((await getDb().select().from(analyticsSalt)).map((row) => row.day)).toBeDefined()
    })

    test("a failure is logged and does not break the read", async () => {
      const logged: unknown[] = []
      const error = console.error
      console.error = (...args: unknown[]) => void logged.push(args)
      try {
        await recordPasteEvent("not-a-uuid", "view", browser("203.0.113.22"))
      } finally {
        console.error = error
      }
      expect(JSON.stringify(logged)).toContain("analytics_record_failed")
    })
  })

  // Day TODAY-2 .. TODAY of traffic on the owner's two pastes, and one on somebody else's.
  async function seedTraffic() {
    const hn = { referer: "https://news.ycombinator.com/x", "cf-ipcountry": "AT" }
    const gh = { referer: "https://github.com/a/b", "cf-ipcountry": "DE" }
    // Today: pub gets three views from two readers, one raw hit by curl, one copy.
    await hit("pub", "view", browser("10.0.0.1", hn), NOW - 3 * HOUR)
    await hit("pub", "view", browser("10.0.0.1", hn), NOW - 2 * HOUR)
    await hit("pub", "view", browser("10.0.0.2", { ...gh, "user-agent": IPHONE }), NOW - HOUR)
    await hit(
      "pub",
      "raw",
      new Headers({ "user-agent": "curl/8.4.0", "x-real-ip": "10.0.0.3" }),
      NOW - HOUR,
    )
    await hit("pub", "copy", browser("10.0.0.2"), NOW - HOUR)
    // Yesterday: second gets two views, one direct.
    await hit("second", "view", browser("10.0.0.4", { "cf-ipcountry": "US" }), NOW - DAY)
    await hit("second", "view", browser("10.0.0.5", gh), NOW - DAY + HOUR)
    // Two days ago: pub once more.
    await hit("pub", "view", browser("10.0.0.1", hn), NOW - 2 * DAY)
    // Not the viewer's.
    await hit("theirs", "view", browser("10.0.0.6"), NOW - HOUR)
  }

  describe("the report", () => {
    test("series-only exports match the complete report for every range and scope", async () => {
      await seedTraffic()
      await getDb().insert(collection).values({ ownerId: "owner", slug: "kit", name: "Kit" })
      await getDb().update(paste).set({ collection: "kit" }).where(eq(paste.slug, "pub"))
      for (const range of ["24h", "7d", "30d", "90d"] as const) {
        for (const scope of [{}, { paste: "pub" }, { collection: "kit" }, { paste: "theirs" }]) {
          const query = { range, ...scope }
          const report = await getAnalyticsReport(query, NOW)
          const series = await getAnalyticsSeries(query, NOW)
          expect(series).toEqual({ range, scope: report.scope, points: report.points })
          expect(analyticsCsv(series)).toBe(analyticsCsv(report))
        }
      }
    })

    test("an hourly export reads its series without loading report panels or comparison totals", async () => {
      await seedTraffic()
      const before = telemetrySnapshot().metrics["db:execute"]?.count ?? 0
      const series = await getAnalyticsSeries({ range: "24h" }, NOW)
      expect(series.points).toHaveLength(24)
      expect((telemetrySnapshot().metrics["db:execute"]?.count ?? 0) - before).toBe(1)
      expect(series.points.reduce((sum, point) => sum + point.values.views, 0)).toBeGreaterThan(0)
    })

    test("totals and series for a week, from hits that haven't been rolled up", async () => {
      await seedTraffic()
      const report = await getAnalyticsReport({ range: "7d" }, NOW)

      expect(report.pasteCount).toBe(3)
      expect(report.scope).toBeNull()
      expect(report.kpis.map((kpi) => [kpi.id, kpi.value])).toEqual([
        ["views", 6],
        ["unique", 5],
        ["copies", 1],
        ["raw", 1],
      ])
      expect(report.points).toHaveLength(7)
      expect(report.points.map((point) => point.date)).toEqual([
        "2026-10-06",
        "2026-10-07",
        "2026-10-08",
        "2026-10-09",
        "2026-10-10",
        "2026-10-11",
        "2026-10-12",
      ])
      expect(report.points.map((point) => point.values.views)).toEqual([0, 0, 0, 0, 1, 2, 3])
      expect(report.points.at(-1)?.values).toEqual({ views: 3, unique: 2, copies: 1, raw: 1 })
      expect(report.rangeLabel).toBe("Oct 6 – Oct 12")
    })

    test("a tile equals the sum of its series", async () => {
      await seedTraffic()
      for (const range of ["7d", "30d", "90d"] as const) {
        const report = await getAnalyticsReport({ range }, NOW)
        expect(report.points).toHaveLength({ "7d": 7, "30d": 30, "90d": 90 }[range])
        for (const kpi of report.kpis) {
          const sum = report.points.reduce((total, point) => total + point.values[kpi.id], 0)
          expect(sum).toBe(kpi.value)
        }
      }
    })

    test("top pastes, referrers, countries, devices and languages", async () => {
      await seedTraffic()
      const report = await getAnalyticsReport({ range: "30d" }, NOW)

      expect(report.topPastes).toEqual([
        { slug: "pub", title: "title-of-pub", language: "typescript", views: 4, unique: 3 },
        { slug: "second", title: "title-of-second", language: "nginx", views: 2, unique: 2 },
      ])
      expect(report.referrers).toEqual([
        {
          id: "news.ycombinator.com",
          label: "news.ycombinator.com",
          domain: "news.ycombinator.com",
          kind: "site",
          views: 3,
        },
        { id: "github.com", label: "github.com", domain: "github.com", kind: "site", views: 2 },
        { id: "direct", label: "Direct or copied link", domain: null, kind: "direct", views: 1 },
      ])
      expect(report.countries).toEqual([
        { code: "at", name: "Austria", views: 3 },
        { code: "de", name: "Germany", views: 2 },
        { code: "us", name: "United States", views: 1 },
      ])
      expect(report.devices).toEqual([
        { id: "desktop", label: "Desktop", views: 5 },
        { id: "mobile", label: "Mobile", views: 1 },
        { id: "cli", label: "CLI and API", views: 1 },
      ])
      expect(report.languages).toEqual([
        { language: "typescript", views: 4 },
        { language: "nginx", views: 2 },
      ])
    })

    test("many referrers collapse into Other", async () => {
      const pasteId = await idOf("pub")
      await getDb()
        .insert(pasteEvent)
        .values(
          Array.from({ length: 9 }, (_, index) => ({
            pasteId,
            at: new Date(NOW - HOUR),
            kind: "view" as const,
            visitor: `visitor-${index}`,
            referrer: `site${index}.example`,
            device: "desktop",
          })),
        )
      const { referrers } = await getAnalyticsReport({ range: "7d" }, NOW)
      expect(referrers).toHaveLength(6)
      expect(referrers.at(-1)).toEqual({
        id: "other",
        label: "Other (4 sources)",
        domain: null,
        kind: "other",
        views: 4,
      })
      expect(referrers.reduce((sum, row) => sum + row.views, 0)).toBe(9)
    })

    test("one paste, or one collection", async () => {
      await seedTraffic()
      await getDb().insert(collection).values({ ownerId: "owner", slug: "ops", name: "Ops notes" })
      await getDb().update(paste).set({ collection: "ops" }).where(eq(paste.slug, "second"))

      const one = await getAnalyticsReport({ range: "30d", paste: "second" }, NOW)
      expect(one.scope).toEqual({ type: "paste", slug: "second", title: "title-of-second" })
      expect(one.pasteCount).toBe(1)
      expect(one.kpis[0]?.value).toBe(2)
      expect(one.topPastes.map((row) => row.slug)).toEqual(["second"])

      const filed = await getAnalyticsReport({ range: "30d", collection: "ops" }, NOW)
      expect(filed.scope).toEqual({ type: "collection", slug: "ops", title: "Ops notes" })
      expect(filed.pasteCount).toBe(1)
      expect(filed.kpis[0]?.value).toBe(2)

      // A paste beats a collection when both are asked for.
      const both = await getAnalyticsReport({ range: "30d", paste: "pub", collection: "ops" }, NOW)
      expect(both.scope?.slug).toBe("pub")
    })

    test("an unknown, someone else's or trashed paste means all pastes", async () => {
      await seedTraffic()
      await getDb().update(paste).set({ deletedAt: new Date() }).where(eq(paste.slug, "second"))
      for (const slug of ["nope", "theirs", "second"]) {
        const report = await getAnalyticsReport({ range: "30d", paste: slug }, NOW)
        expect(report.scope).toBeNull()
      }
      const report = await getAnalyticsReport({ range: "30d" }, NOW)
      expect(report.pasteCount).toBe(2)
      expect(report.kpis[0]?.value).toBe(4)
    })

    test("only the viewer's own pastes, and nothing when signed out", async () => {
      await seedTraffic()
      signInAs("other")
      const theirs = await getAnalyticsReport({ range: "30d" }, NOW)
      expect(theirs.kpis[0]?.value).toBe(1)
      expect(theirs.topPastes.map((row) => row.slug)).toEqual(["theirs"])
      expect(theirs.pasteOptions.map((option) => option.slug)).toEqual(["theirs"])

      signInAs(null)
      const nobody = await getAnalyticsReport({ range: "30d" }, NOW)
      expect(nobody.pasteCount).toBe(0)
      expect(nobody.kpis.map((kpi) => kpi.value)).toEqual([0, 0, 0, 0])
      expect(nobody.topPastes).toEqual([])
    })

    test("an empty account still draws every point and the three devices", async () => {
      const report = await getAnalyticsReport({ range: "90d" }, NOW)
      expect(report.points).toHaveLength(90)
      expect(report.kpis.every((kpi) => kpi.value === 0 && kpi.delta === null)).toBe(true)
      expect(report.devices.map((row) => row.views)).toEqual([0, 0, 0])
      expect(report.referrers).toEqual([])
      expect(report.pasteOptions.map((option) => option.slug).sort()).toEqual([
        "priv",
        "pub",
        "second",
      ])
    })

    test("the change is against the period before, or absent when it had nothing", async () => {
      // 4 views today-ish, 2 in the week before: +100%.
      for (let i = 0; i < 4; i++) await hit("pub", "view", browser(`10.1.0.${i}`), NOW - HOUR)
      for (let i = 0; i < 2; i++) await hit("pub", "view", browser(`10.1.1.${i}`), NOW - 8 * DAY)
      const report = await getAnalyticsReport({ range: "7d" }, NOW)
      expect(report.kpis.find((kpi) => kpi.id === "views")).toMatchObject({ value: 4, delta: 100 })
      expect(report.kpis.find((kpi) => kpi.id === "raw")?.delta).toBeNull()
    })

    test("24h is hourly, counts a reader once, and compares with the 24 hours before", async () => {
      const reader = browser("10.2.0.1")
      await hit("pub", "view", reader, NOW - 5 * HOUR)
      await hit("pub", "view", reader, NOW - 2 * HOUR)
      await hit("pub", "view", reader, NOW - 30 * 60_000)
      await hit("pub", "view", browser("10.2.0.2"), NOW - 30 * 60_000)
      await hit("pub", "view", browser("10.2.0.3"), NOW - 30 * HOUR)
      await hit("pub", "view", browser("10.2.0.4"), NOW - 70 * HOUR)

      const report = await getAnalyticsReport({ range: "24h" }, NOW)
      expect(report.points).toHaveLength(24)
      expect(report.points[0]).toMatchObject({ date: "2026-10-11 16:00", label: "16:00" })
      expect(report.points.at(-1)).toMatchObject({ date: "2026-10-12 15:00", label: "15:00" })
      expect(report.points.at(-1)?.values.views).toBe(2)
      expect(report.points.at(-1)?.values.unique).toBe(2)
      expect(report.kpis.find((kpi) => kpi.id === "views")).toMatchObject({ value: 4, delta: 300 })
      expect(report.kpis.find((kpi) => kpi.id === "unique")?.value).toBe(2)
      expect(report.topPastes[0]).toMatchObject({ slug: "pub", views: 4 })
    })
  })

  describe("the rollup", () => {
    // Traffic on the five days up to today, a different amount each day.
    async function seedWeek() {
      for (let back = 4; back >= 0; back--) {
        for (let i = 0; i <= back; i++) {
          const headers = browser(`10.3.${back}.${i % 2}`, {
            referer: i === 0 ? "https://example.org/" : "https://github.com/",
            "cf-ipcountry": i === 0 ? "FR" : "AT",
          })
          await hit(i === 2 ? "second" : "pub", "view", headers, NOW - back * DAY - i * HOUR)
        }
        await hit(
          "pub",
          "raw",
          new Headers({ "user-agent": "curl/8", "x-real-ip": "10.4.0.1" }),
          NOW - back * DAY,
        )
      }
    }

    test("the report is the same before and after a rollup, and after another", async () => {
      await seedWeek()
      const before = await getAnalyticsReport({ range: "7d" }, NOW)
      expect(before.kpis[0]?.value).toBe(15)

      const first = await rollUpAnalytics(new Date(NOW))
      expect(first).toEqual({ days: 5, removed: 11 })
      expect(await getAnalyticsReport({ range: "7d" }, NOW)).toEqual(before)
      expect(await getAnalyticsReport({ range: "30d" }, NOW)).toMatchObject({
        kpis: before.kpis.map((kpi) => ({ id: kpi.id, value: kpi.value })),
      })

      await rollUpAnalytics(new Date(NOW))
      expect(await getAnalyticsReport({ range: "7d" }, NOW)).toEqual(before)
    })

    test("older days come from the rollup tables alone", async () => {
      await seedWeek()
      const before = await getAnalyticsReport({ range: "7d" }, NOW)
      await rollUpAnalytics(new Date(NOW))
      // Days up to yesterday are final, and the two oldest days' hits are gone.
      const [state] = await getDb().select().from(analyticsRollup)
      expect(state).toEqual({ id: 1, finalizedDay: TODAY - 1 })
      expect((await events()).every((row) => row.at.getTime() >= (TODAY - 2) * DAY)).toBe(true)
      expect(await getAnalyticsReport({ range: "7d" }, NOW)).toEqual(before)

      const rolled = await getDb().select().from(pasteStatsDay).orderBy(pasteStatsDay.day)
      expect(
        rolled.map((row) => row.day).filter((day, index, all) => all.indexOf(day) === index),
      ).toEqual([TODAY - 4, TODAY - 3, TODAY - 2, TODAY - 1, TODAY])
    })

    test("running it again replaces the day instead of adding to it", async () => {
      await seedWeek()
      await rollUpAnalytics(new Date(NOW))
      const total = async () => {
        const [row] = await getDb()
          .select({ views: sql<number>`sum(${pasteStatsDay.views})::int` })
          .from(pasteStatsDay)
        return row?.views
      }
      expect(await total()).toBe(15)
      await rollUpAnalytics(new Date(NOW))
      expect(await total()).toBe(15)

      // New traffic today shows up in the next run, and in the report before it.
      await hit("pub", "view", browser("10.5.0.1"), NOW + 60_000)
      expect((await getAnalyticsReport({ range: "7d" }, NOW + 120_000)).kpis[0]?.value).toBe(16)
      await rollUpAnalytics(new Date(NOW + 120_000))
      expect(await total()).toBe(16)
    })

    test("a day is final only once it has been over for a few minutes", async () => {
      await hit("pub", "view", browser("10.6.0.1"), Date.UTC(2026, 9, 11, 23, 59))
      await rollUpAnalytics(new Date(Date.UTC(2026, 9, 12, 0, 2)))
      expect((await getDb().select().from(analyticsRollup))[0]?.finalizedDay).toBe(TODAY - 2)
      await rollUpAnalytics(new Date(Date.UTC(2026, 9, 12, 0, 10)))
      expect((await getDb().select().from(analyticsRollup))[0]?.finalizedDay).toBe(TODAY - 1)
    })

    test("a rollup that missed days catches up on all of them", async () => {
      await seedWeek()
      await rollUpAnalytics(new Date(NOW - 4 * DAY))
      expect((await getDb().select().from(analyticsRollup))[0]?.finalizedDay).toBe(TODAY - 5)
      await rollUpAnalytics(new Date(NOW))
      expect((await getDb().select().from(analyticsRollup))[0]?.finalizedDay).toBe(TODAY - 1)

      const report = await getAnalyticsReport({ range: "7d" }, NOW)
      expect(report.points.map((point) => point.values.views)).toEqual([0, 0, 5, 4, 3, 2, 1])
    })

    test("rolled-up history from before the hits is read as is", async () => {
      await getDb()
        .insert(analyticsRollup)
        .values({ id: 1, finalizedDay: TODAY - 1 })
      await getDb()
        .insert(pasteStatsDay)
        .values({ pasteId: await idOf("pub"), day: TODAY - 10, views: 7 })
      await hit("pub", "view", browser("10.7.0.1"), NOW)
      const report = await getAnalyticsReport({ range: "30d" }, NOW)
      expect(report.kpis[0]?.value).toBe(8)
      expect(report.points.at(-11)).toMatchObject({ date: "2026-10-02", values: { views: 7 } })
    })

    test("old salts go, today's and yesterday's stay", async () => {
      await getDb()
        .insert(analyticsSalt)
        .values([
          { day: TODAY - 3, salt: "a" },
          { day: TODAY - 2, salt: "b" },
          { day: TODAY - 1, salt: "c" },
          { day: TODAY, salt: "d" },
        ])
      await rollUpAnalytics(new Date(NOW))
      expect((await getDb().select().from(analyticsSalt)).map((row) => row.day).sort()).toEqual([
        TODAY - 1,
        TODAY,
      ])
    })

    test("two at once do the work once", async () => {
      await seedWeek()
      const results = await Promise.all([
        rollUpAnalytics(new Date(NOW)),
        rollUpAnalytics(new Date(NOW)),
      ])
      expect(results.filter((result) => result === null).length).toBeLessThanOrEqual(1)
      expect((await getAnalyticsReport({ range: "7d" }, NOW)).kpis[0]?.value).toBe(15)
    })

    test("deleting a paste takes its hits and rollups with it", async () => {
      await seedWeek()
      await rollUpAnalytics(new Date(NOW))
      const count = async (
        table: typeof pasteStatsDay | typeof pasteBreakdownDay | typeof pasteEvent,
      ) => (await getDb().select().from(table)).length
      expect(await count(pasteStatsDay)).toBeGreaterThan(0)

      await getDb().delete(paste)
      expect(await count(pasteStatsDay)).toBe(0)
      expect(await count(pasteBreakdownDay)).toBe(0)
      expect(await count(pasteEvent)).toBe(0)
    })
  })

  describe("GET /api/stats", () => {
    const get = (query = "") => statsRoute(new Request(`http://x/api/stats${query}`))

    test("answers 401 to someone who isn't signed in", async () => {
      signInAs(null)
      const response = await get()
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ ok: false, error: "Sign in to see analytics." })
    })

    test("returns the report as JSON, never cached", async () => {
      await seedTraffic()
      const response = await get("?range=7d")
      expect(response.status).toBe(200)
      expect(response.headers.get("cache-control")).toBe("private, no-store")
      const body = await response.json()
      expect(body.range).toBe("7d")
      expect(body.points).toHaveLength(7)
      expect(Object.keys(body).sort()).toEqual(
        [
          "countries",
          "devices",
          "kpis",
          "languages",
          "pasteCount",
          "pasteOptions",
          "points",
          "range",
          "rangeLabel",
          "referrers",
          "scope",
          "topPastes",
        ].sort(),
      )
    })

    test("takes a range, a paste or a collection, and defaults the rest", async () => {
      expect((await (await get("?range=90d")).json()).points).toHaveLength(90)
      expect((await (await get("?range=24h")).json()).points).toHaveLength(24)
      expect((await (await get("?range=bogus")).json()).range).toBe("30d")
      expect((await (await get()).json()).range).toBe("30d")
      expect((await (await get("?paste=pub")).json()).scope).toMatchObject({
        type: "paste",
        slug: "pub",
      })
    })
  })
})
