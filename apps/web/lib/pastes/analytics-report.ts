import "server-only"

import { allowedPaste } from "@workspace/db/moderation"

import { collection as collectionTable, paste as pasteTable } from "@workspace/db/schema"
import { and, desc, eq, isNull, type SQL, sql } from "drizzle-orm"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import type { Locale } from "@/lib/i18n/config"
import { coreTranslator } from "@/lib/i18n/core"
import { DAY, HOUR } from "@/lib/time"
import {
  type AnalyticsQuery,
  type AnalyticsReport,
  type CountryRow,
  type DeviceRow,
  type Kpi,
  METRICS,
  type MetricId,
  POINT_COUNT,
  type Referrer,
  type SeriesPoint,
} from "./analytics"
import { dayBreakdown, dayStats, eventBreakdown, eventStats } from "./stats-sql"

// The Analytics page's figures and the body of GET /api/stats, read from the rollup tables and
// the recent hits (see rollup.ts for how they fit together). Everything is limited to the
// signed-in viewer's own pastes, and to one paste or collection when asked.
//
// Unique visitors are counted per paste per UTC day and added up, so a reader who comes back on
// another day, or opens two of your pastes, is counted again. Only the 24h range counts across
// the day: there each reader of a paste is counted once.

const TOP_PASTES = 5
const OPTIONS = 25
const REFERRERS = 5
const COUNTRIES = 9
const LANGUAGES = 9

const DEVICE_LABELS: Record<DeviceRow["id"], string> = {
  desktop: "Desktop",
  mobile: "Mobile",
  cli: "CLI and API",
}

type Totals = Record<MetricId, number>
const none = (): Totals => ({ views: 0, unique: 0, copies: 0, raw: 0 })

type SeriesRow = {
  // The day (days since the epoch) or hour (hours since the epoch) the counts belong to.
  slot: number
  views: number
  uniques: number
  raw: number
  copies: number
}

type BreakdownRow = {
  dimension: "referrer" | "country" | "device"
  key: string
  hits: number
  keys: number
  total: number
}

function percentChange(current: number, previous: number) {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

// The counts per day or hour of the period, and the totals of it and of the one before.
interface Series {
  rows: Map<number, SeriesRow>
  total: Totals
  before: Totals
}

function add(into: Totals, row: Omit<SeriesRow, "slot">) {
  into.views += row.views
  into.unique += row.uniques
  into.copies += row.copies
  into.raw += row.raw
}

// The viewer's live pastes, optionally narrowed, as a subquery of ids.
function pasteIds(viewer: string | null, narrow?: SQL) {
  if (!viewer) return sql`SELECT id FROM paste WHERE false`
  return sql`SELECT id FROM paste WHERE owner_id = ${viewer} AND ${allowedPaste()} AND deleted_at IS NULL${
    narrow ? sql` AND ${narrow}` : sql``
  }`
}

async function resolveScope(viewer: string | null, query: AnalyticsQuery) {
  const db = getDb()
  const all = { scope: null, ids: pasteIds(viewer) }
  if (!viewer) return all

  if (query.paste) {
    const [found] = await db
      .select({ id: pasteTable.id, slug: pasteTable.slug, title: pasteTable.title })
      .from(pasteTable)
      .where(
        and(
          allowedPaste(),
          eq(pasteTable.ownerId, viewer),
          isNull(pasteTable.deletedAt),
          eq(pasteTable.slug, query.paste),
        ),
      )
    if (found) {
      return {
        scope: { type: "paste" as const, slug: found.slug, title: found.title },
        ids: pasteIds(viewer, sql`id = ${found.id}`),
      }
    }
  }
  if (query.collection) {
    const [found] = await db
      .select({ slug: collectionTable.slug, name: collectionTable.name })
      .from(collectionTable)
      .where(and(eq(collectionTable.ownerId, viewer), eq(collectionTable.slug, query.collection)))
    if (found) {
      return {
        scope: { type: "collection" as const, slug: found.slug, title: found.name },
        ids: pasteIds(viewer, sql`collection = ${found.slug}`),
      }
    }
  }
  return all
}

// The first day the figures must come from the recent hits instead of the rollup tables.
async function firstUnrolledDay() {
  const [row] = await getDb().execute<{ finalized: number | null }>(
    sql`SELECT finalized_day AS finalized FROM analytics_rollup WHERE id = 1`,
  )
  // Without a rollup yet, every day is read from the hits.
  return row?.finalized == null ? 0 : row.finalized + 1
}

// One query over the previous period and this one: `rows` start at the previous period's first
// day, and its totals are the sums of its days.
async function dailySeries(rows: SQL, first: number): Promise<Series> {
  const found = await getDb().execute<SeriesRow>(sql`
    SELECT day AS slot, sum(views)::int AS views, sum(uniques)::int AS uniques,
      sum(raw)::int AS raw, sum(copies)::int AS copies
    FROM (${rows}) r GROUP BY day`)
  const series: Series = { rows: new Map(), total: none(), before: none() }
  for (const row of found) {
    series.rows.set(row.slot, row)
    add(row.slot >= first ? series.total : series.before, row)
  }
  return series
}

// Per hour, plus the totals of the two 24-hour windows counted on their own, because a reader
// who comes back in another hour is still one reader in the window.
async function hourlySeries(
  prevStart: number,
  start: number,
  end: number,
  ids: SQL,
): Promise<Series> {
  const db = getDb()
  const events = sql`FROM paste_event e
    WHERE e.at >= ${new Date(prevStart).toISOString()} AND e.at < ${new Date(end).toISOString()}
      AND e.paste_id IN (${ids})`
  const counts = sql`
      (count(*) FILTER (WHERE e.kind = 'view'))::int AS views,
      (count(DISTINCT (e.paste_id, e.visitor)) FILTER (WHERE e.kind = 'view'))::int AS uniques,
      (count(*) FILTER (WHERE e.kind = 'raw'))::int AS raw,
      (count(*) FILTER (WHERE e.kind = 'copy'))::int AS copies`
  const [hours, windows] = await Promise.all([
    db.execute<SeriesRow>(sql`
      SELECT floor(extract(epoch FROM e.at) / 3600)::int AS slot, ${counts}
      ${events} GROUP BY 1`),
    db.execute<Omit<SeriesRow, "slot"> & { recent: boolean }>(sql`
      SELECT (e.at >= ${new Date(start).toISOString()}) AS recent, ${counts}
      ${events} GROUP BY 1`),
  ])
  const series: Series = {
    rows: new Map(hours.map((row) => [row.slot, row])),
    total: none(),
    before: none(),
  }
  for (const row of windows) add(row.recent ? series.total : series.before, row)
  return series
}

async function topPastes(rows: SQL) {
  const found = await getDb().execute<{
    slug: string
    title: string
    language: string
    views: number
    uniques: number
  }>(sql`
    SELECT p.slug, p.title, coalesce(f.language, 'text') AS language,
      sum(r.views)::int AS views, sum(r.uniques)::int AS uniques
    FROM (${rows}) r
    JOIN paste p ON p.id = r.paste_id
    LEFT JOIN LATERAL (
      SELECT language FROM paste_file WHERE paste_id = p.id ORDER BY position, id LIMIT 1
    ) f ON true
    GROUP BY p.id, f.language
    HAVING sum(r.views) > 0
    ORDER BY sum(r.views) DESC, p.slug
    LIMIT ${TOP_PASTES}`)
  return found.map((row) => ({
    slug: row.slug,
    title: row.title,
    language: row.language,
    views: row.views,
    unique: row.uniques,
  }))
}

async function languages(rows: SQL) {
  const found = await getDb().execute<{ language: string; views: number }>(sql`
    SELECT coalesce(f.language, 'text') AS language, sum(r.views)::int AS views
    FROM (${rows}) r
    LEFT JOIN LATERAL (
      SELECT language FROM paste_file WHERE paste_id = r.paste_id ORDER BY position, id LIMIT 1
    ) f ON true
    GROUP BY 1
    HAVING sum(r.views) > 0
    ORDER BY 2 DESC, 1
    LIMIT ${LANGUAGES}`)
  return found.map((row) => ({ language: row.language, views: row.views }))
}

// The biggest keys of each dimension, with how many keys and hits the dimension has in all.
async function breakdown(rows: SQL) {
  return getDb().execute<BreakdownRow>(sql`
    SELECT dimension::text AS dimension, key, hits, keys, total FROM (
      SELECT dimension, key, hits,
        row_number() OVER (PARTITION BY dimension ORDER BY hits DESC, key) AS rank,
        (count(*) OVER (PARTITION BY dimension))::int AS keys,
        (sum(hits) OVER (PARTITION BY dimension))::int AS total
      FROM (
        SELECT dimension, key, sum(hits)::int AS hits FROM (${rows}) b GROUP BY dimension, key
      ) grouped
    ) ranked
    WHERE rank <= ${Math.max(REFERRERS, COUNTRIES)}
    ORDER BY dimension, hits DESC, key`)
}

function referrersOf(rows: BreakdownRow[], locale: Locale): Referrer[] {
  const t = coreTranslator(locale)
  const found = rows.filter((row) => row.dimension === "referrer")
  const shown = found.slice(0, REFERRERS).map(
    (row): Referrer =>
      row.key === ""
        ? {
            id: "direct",
            label: t("direct"),
            domain: null,
            kind: "direct",
            views: row.hits,
          }
        : { id: row.key, label: row.key, domain: row.key, kind: "site", views: row.hits },
  )
  const keys = found[0]?.keys ?? 0
  const total = found[0]?.total ?? 0
  if (keys > shown.length) {
    const views = total - shown.reduce((sum, row) => sum + row.views, 0)
    shown.push({
      id: "other",
      label: t("otherSources", { count: keys - shown.length }),
      domain: null,
      kind: "other",
      views,
    })
  }
  return shown
}

function countriesOf(rows: BreakdownRow[], locale: Locale): CountryRow[] {
  const regionNames = new Intl.DisplayNames([locale], { type: "region" })
  return rows
    .filter((row) => row.dimension === "country")
    .slice(0, COUNTRIES)
    .map((row) => ({
      code: row.key.toLowerCase(),
      name: regionNames.of(row.key) ?? row.key,
      views: row.hits,
    }))
}

function devicesOf(rows: BreakdownRow[]): DeviceRow[] {
  const hits = new Map(rows.filter((row) => row.dimension === "device").map((r) => [r.key, r.hits]))
  return (Object.keys(DEVICE_LABELS) as DeviceRow["id"][]).map((id) => ({
    id,
    label: DEVICE_LABELS[id],
    views: hits.get(id) ?? 0,
  }))
}

function point(
  time: number,
  hourly: boolean,
  row: SeriesRow | undefined,
  locale: Locale,
): SeriesPoint {
  const dayFormat = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
  const iso = new Date(time).toISOString()
  return {
    date: hourly ? `${iso.slice(0, 13).replace("T", " ")}:00` : iso.slice(0, 10),
    label: hourly ? `${iso.slice(11, 13)}:00` : dayFormat.format(time),
    values: {
      views: row?.views ?? 0,
      unique: row?.uniques ?? 0,
      copies: row?.copies ?? 0,
      raw: row?.raw ?? 0,
    },
  }
}

export async function getAnalyticsReport(
  query: AnalyticsQuery,
  now = Date.now(),
  locale: Locale = "en",
): Promise<AnalyticsReport> {
  const t = coreTranslator(locale)
  const db = getDb()
  const viewer = (await getSession())?.user.id ?? null
  const { range } = query
  const { scope, ids } = await resolveScope(viewer, query)

  const hourly = range === "24h"
  const count = POINT_COUNT[range]
  const step = hourly ? HOUR : DAY
  const last = Math.floor(now / step)
  const first = last - count + 1
  const previous = first - count

  // Which hits and rollups answer for the current period, and for this and the one before it.
  const rawFrom = hourly ? 0 : await firstUnrolledDay()
  const current = hourly
    ? {
        stats: eventStats(first * HOUR, (last + 1) * HOUR, ids),
        breakdown: eventBreakdown(first * HOUR, (last + 1) * HOUR, ids),
      }
    : {
        stats: dayStats(first, last, rawFrom, ids),
        breakdown: dayBreakdown(first, last, rawFrom, ids),
      }

  const [series, tops, byLanguage, hits, [counted], options] = await Promise.all([
    hourly
      ? hourlySeries(previous * HOUR, first * HOUR, (last + 1) * HOUR, ids)
      : dailySeries(dayStats(previous, last, rawFrom, ids), first),
    topPastes(current.stats),
    languages(current.stats),
    breakdown(current.breakdown),
    db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM (${ids}) s`),
    viewer
      ? db
          .select({ slug: pasteTable.slug, title: pasteTable.title })
          .from(pasteTable)
          .where(and(allowedPaste(), eq(pasteTable.ownerId, viewer), isNull(pasteTable.deletedAt)))
          .orderBy(desc(pasteTable.views), desc(pasteTable.updatedAt), pasteTable.id)
          .limit(OPTIONS)
      : [],
  ])

  const points = Array.from({ length: count }, (_, index) =>
    point((first + index) * step, hourly, series.rows.get(first + index), locale),
  )
  const kpis: Kpi[] = METRICS.map((metric) => ({
    id: metric.id,
    label: t(
      (
        {
          views: "metricViews",
          unique: "metricUnique",
          copies: "metricCopies",
          raw: "metricRaw",
        } as const
      )[metric.id],
    ),
    value: series.total[metric.id],
    delta: percentChange(series.total[metric.id], series.before[metric.id]),
  }))

  const firstPoint = points[0]
  const lastPoint = points.at(-1)
  // The selected paste is always in the list, even when it isn't among the most viewed.
  const currentScope = scope?.type === "paste" ? (await resolveScope(viewer, query)).scope : scope
  const currentOptions =
    scope?.type === "paste" && currentScope?.type !== "paste"
      ? options.filter((option) => option.slug !== scope.slug)
      : options
  const pasteOptions =
    currentScope?.type === "paste" &&
    !currentOptions.some((option) => option.slug === currentScope.slug)
      ? [...currentOptions, { slug: currentScope.slug, title: currentScope.title }]
      : currentOptions

  return {
    range,
    pasteCount: counted?.n ?? 0,
    scope: currentScope,
    pasteOptions,
    rangeLabel: `${firstPoint?.label ?? ""} – ${lastPoint?.label ?? ""}`,
    kpis,
    points,
    topPastes: tops,
    referrers: referrersOf(hits, locale),
    countries: countriesOf(hits, locale),
    devices: devicesOf(hits).map((row) => ({
      ...row,
      label: t(
        ({ desktop: "deviceDesktop", mobile: "deviceMobile", cli: "deviceCli" } as const)[row.id],
      ),
    })),
    languages: byLanguage,
  }
}
