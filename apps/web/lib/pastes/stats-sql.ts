import "server-only"

import { type SQL, sql } from "drizzle-orm"
import { DAY } from "@/lib/time"

// SQL for turning paste_event rows into the shapes the rollup tables store, so the rollup job
// writes exactly what the Analytics page reads for recent days that haven't been rolled up yet.
// `scope` is a subquery of paste ids the rows are limited to.

const dayOfEvent = sql`floor(extract(epoch FROM e.at) / 86400)::int`

function inWindow(from: number, to: number, scope?: SQL) {
  return sql`e.at >= ${new Date(from).toISOString()} AND e.at < ${new Date(to).toISOString()}${
    scope ? sql` AND e.paste_id IN (${scope})` : sql``
  }`
}

// Rows shaped like paste_stats_day: (paste_id, day, views, uniques, raw, copies), for the events
// in [from, to) in epoch milliseconds.
export function eventStats(from: number, to: number, scope?: SQL) {
  return sql`
    SELECT e.paste_id, ${dayOfEvent} AS day,
      (count(*) FILTER (WHERE e.kind = 'view'))::int AS views,
      (count(DISTINCT e.visitor) FILTER (WHERE e.kind = 'view'))::int AS uniques,
      (count(*) FILTER (WHERE e.kind = 'raw'))::int AS raw,
      (count(*) FILTER (WHERE e.kind = 'copy'))::int AS copies
    FROM paste_event e
    WHERE ${inWindow(from, to, scope)}
    GROUP BY e.paste_id, ${dayOfEvent}`
}

// Rows shaped like paste_breakdown_day: (paste_id, day, dimension, key, hits). Referrers and
// countries are views only; devices include raw hits, which is where "CLI and API" shows up.
export function eventBreakdown(from: number, to: number, scope?: SQL) {
  const base = sql`FROM paste_event e WHERE ${inWindow(from, to, scope)}`
  const group = sql`GROUP BY e.paste_id, ${dayOfEvent}`
  return sql`
    SELECT e.paste_id, ${dayOfEvent} AS day, 'referrer'::breakdown_dimension AS dimension,
      coalesce(e.referrer, '') AS key, count(*)::int AS hits
    ${base} AND e.kind = 'view' ${group}, coalesce(e.referrer, '')
    UNION ALL
    SELECT e.paste_id, ${dayOfEvent}, 'country'::breakdown_dimension, e.country, count(*)::int
    ${base} AND e.kind = 'view' AND e.country IS NOT NULL ${group}, e.country
    UNION ALL
    SELECT e.paste_id, ${dayOfEvent}, 'device'::breakdown_dimension, e.device, count(*)::int
    ${base} AND e.kind IN ('view', 'raw') ${group}, e.device`
}

// Per-paste per-day rows for the days in [fromDay, toDay] (days since the epoch): rolled-up days
// from the rollup table, and days from `rawFrom` on straight from the events, because those may
// not have been rolled up yet (or not completely).
function layered(
  rolledUp: (fromDay: number, toDay: number) => SQL,
  fromEvents: (from: number, to: number) => SQL,
  empty: SQL,
  [fromDay, toDay, rawFrom]: [number, number, number],
) {
  const rolledTo = Math.min(toDay, rawFrom - 1)
  const eventsFrom = Math.max(fromDay, rawFrom)
  const parts: SQL[] = []
  if (fromDay <= rolledTo) parts.push(rolledUp(fromDay, rolledTo))
  if (eventsFrom <= toDay) parts.push(fromEvents(eventsFrom * DAY, (toDay + 1) * DAY))
  return parts.length > 0 ? sql.join(parts, sql` UNION ALL `) : empty
}

export function dayStats(fromDay: number, toDay: number, rawFrom: number, scope: SQL) {
  return layered(
    (from, to) => sql`
      SELECT paste_id, day, views, uniques, raw, copies FROM paste_stats_day
      WHERE day >= ${from} AND day <= ${to} AND paste_id IN (${scope})`,
    (from, to) => eventStats(from, to, scope),
    sql`SELECT paste_id, day, views, uniques, raw, copies FROM paste_stats_day WHERE false`,
    [fromDay, toDay, rawFrom],
  )
}

export function dayBreakdown(fromDay: number, toDay: number, rawFrom: number, scope: SQL) {
  return layered(
    (from, to) => sql`
      SELECT paste_id, day, dimension, key, hits FROM paste_breakdown_day
      WHERE day >= ${from} AND day <= ${to} AND paste_id IN (${scope})`,
    (from, to) => eventBreakdown(from, to, scope),
    sql`SELECT paste_id, day, dimension, key, hits FROM paste_breakdown_day WHERE false`,
    [fromDay, toDay, rawFrom],
  )
}
