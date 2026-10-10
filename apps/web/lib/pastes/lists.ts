import "server-only"

import { pasteFile, paste as pasteTable } from "@workspace/db/schema"
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { DAY } from "@/lib/time"
import { cursorKey, decodeCursor, encodeCursor } from "./cursor"
import { PASTE_PAGE_SIZE, type PasteListQuery } from "./list-query"
import { TRASH_DAYS } from "./purge"
import { purgeTrash, readableStarsWhere, summarizePastes } from "./store"

export interface PasteListScope {
  mode: "mine" | "starred" | "collection" | "trash"
  collection?: string
}

// Database pagination, counts and facet values all use the same access scope. File contents and
// view history never participate in a list response.
export async function listPastePage(scope: PasteListScope, query: PasteListQuery) {
  const viewer = (await getSession())?.user.id ?? null
  if (!viewer)
    return {
      pastes: [],
      query,
      pagination: { page: 1, pageCount: 1, total: 0, totalAll: 0 },
      languageOptions: [] as string[],
    }
  if (scope.mode === "trash") await purgeTrash(viewer)
  const db = getDb()
  const language = db
    .select({ language: pasteFile.language })
    .from(pasteFile)
    .where(eq(pasteFile.pasteId, pasteTable.id))
    .orderBy(pasteFile.position, pasteFile.id)
    .limit(1)
  const firstLanguage = sql<string>`coalesce((${language}), 'text')`
  const base =
    scope.mode === "starred"
      ? await readableStarsWhere(viewer)
      : and(
          eq(pasteTable.ownerId, viewer),
          scope.mode === "trash"
            ? gte(pasteTable.deletedAt, new Date(Date.now() - TRASH_DAYS * DAY))
            : isNull(pasteTable.deletedAt),
          scope.mode === "collection"
            ? eq(pasteTable.collection, scope.collection ?? "")
            : undefined,
        )
  const visibility = query.visibility.map((value) =>
    value === "burn"
      ? eq(pasteTable.burnAfterRead, true)
      : and(eq(pasteTable.visibility, value), eq(pasteTable.burnAfterRead, false)),
  )
  const filters = and(
    base,
    query.q
      ? or(
          ilike(pasteTable.title, `%${query.q.replace(/[\\%_]/g, "\\$&")}%`),
          ilike(pasteTable.slug, `%${query.q.replace(/[\\%_]/g, "\\$&")}%`),
        )
      : undefined,
    query.languages.length ? inArray(firstLanguage, query.languages) : undefined,
    visibility.length ? or(...visibility) : undefined,
    query.collections.length
      ? and(eq(pasteTable.ownerId, viewer), inArray(pasteTable.collection, query.collections))
      : undefined,
    query.owner === "mine"
      ? eq(pasteTable.ownerId, viewer)
      : query.owner === "shared"
        ? ne(pasteTable.ownerId, viewer)
        : undefined,
  )
  const filtered = Boolean(
    query.q ||
      query.languages.length ||
      query.visibility.length ||
      query.collections.length ||
      query.owner !== "all",
  )
  const allCount = db.select({ count: sql<number>`count(*)::int` }).from(pasteTable).where(base)
  // Materialize the promise once: awaiting a Drizzle builder twice executes it twice.
  const allResult = Promise.resolve(allCount)
  const [[all], [matching], facets] = await Promise.all([
    allResult,
    filtered
      ? db.select({ count: sql<number>`count(*)::int` }).from(pasteTable).where(filters)
      : allResult,
    db.selectDistinct({ language: firstLanguage }).from(pasteTable).where(base),
  ])
  const total = matching?.count ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PASTE_PAGE_SIZE))
  const page = Math.min(query.page, pageCount)
  const orders: Record<PasteListQuery["sort"], SQL> = {
    updated: desc(pasteTable.updatedAt),
    views: desc(pasteTable.views),
    expires: asc(pasteTable.expiresAt),
    title: asc(sql`lower(${pasteTable.title})`),
  }
  const key = cursorKey(viewer, scope, query)
  let cursor = decodeCursor(query.cursor, key, page)
  const title = sql<string>`lower(${pasteTable.title})`
  const rawColumn =
    scope.mode === "trash"
      ? pasteTable.deletedAt
      : query.sort === "updated"
        ? pasteTable.updatedAt
        : query.sort === "views"
          ? pasteTable.views
          : query.sort === "title"
            ? title
            : pasteTable.expiresAt
  const column = sql`${rawColumn}`
  // PostgreSQL timestamps may contain microseconds that JavaScript Date would truncate.
  const cursorTimestamp =
    scope.mode === "trash" || query.sort === "updated" || query.sort === "expires"
      ? sql<
          string | null
        >`to_char(${rawColumn} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
      : sql<null>`null`
  // Validate types before binding values to timestamp/integer columns. Bad cursors fall back
  // to the numbered-page path; access filters always remain in the SQL predicate.
  if (
    cursor &&
    (scope.mode === "trash" || query.sort === "updated" || query.sort === "expires") &&
    !(
      (cursor.value === null && query.sort === "expires") ||
      (typeof cursor.value === "string" &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(cursor.value) &&
        Number.isFinite(Date.parse(cursor.value)) &&
        new Date(cursor.value).toISOString().slice(0, 23) === cursor.value.slice(0, 23))
    )
  )
    cursor = null
  if (
    cursor &&
    query.sort === "views" &&
    scope.mode !== "trash" &&
    typeof cursor.value !== "number"
  )
    cursor = null
  if (
    cursor &&
    query.sort === "title" &&
    scope.mode !== "trash" &&
    typeof cursor.value !== "string"
  )
    cursor = null
  const ascending = scope.mode !== "trash" && (query.sort === "title" || query.sort === "expires")
  const before = cursor?.direction === "before"
  let seek: SQL | undefined
  if (cursor) {
    const id = before ? lt(pasteTable.id, cursor.id) : gt(pasteTable.id, cursor.id)
    const nullsLast = query.sort === "expires" && scope.mode !== "trash"
    if (cursor.value === null)
      seek = before ? or(isNotNull(column), and(isNull(column), id)) : and(isNull(column), id)
    else {
      const compare = ascending !== before ? gt(column, cursor.value) : lt(column, cursor.value)
      seek = or(
        compare,
        and(eq(column, cursor.value), id),
        nullsLast && !before ? isNull(column) : undefined,
      )
    }
  }
  const order = scope.mode === "trash" ? desc(pasteTable.deletedAt) : orders[query.sort]
  const reversed =
    query.sort === "expires" && scope.mode !== "trash"
      ? sql`${column} DESC NULLS FIRST`
      : ascending
        ? desc(column)
        : asc(column)
  let records = await db
    .select({ ...getTableColumns(pasteTable), cursorTitle: title, cursorTimestamp })
    .from(pasteTable)
    .where(and(filters, seek))
    .orderBy(before ? reversed : order, before ? desc(pasteTable.id) : asc(pasteTable.id))
    .limit(PASTE_PAGE_SIZE)
    .offset(cursor ? 0 : (page - 1) * PASTE_PAGE_SIZE)
  if (cursor && !records.length && total > 0) {
    records = await db
      .select({ ...getTableColumns(pasteTable), cursorTitle: title, cursorTimestamp })
      .from(pasteTable)
      .where(filters)
      .orderBy(order, asc(pasteTable.id))
      .limit(PASTE_PAGE_SIZE)
      .offset((page - 1) * PASTE_PAGE_SIZE)
  } else if (before) records = records.reverse()
  const token = (
    row: (typeof records)[number] | undefined,
    direction: "before" | "after",
    targetPage: number,
  ) => {
    if (!row) return undefined
    const value =
      scope.mode === "trash"
        ? row.cursorTimestamp
        : query.sort === "updated"
          ? row.cursorTimestamp
          : query.sort === "views"
            ? row.views
            : query.sort === "title"
              ? row.cursorTitle
              : row.cursorTimestamp
    return encodeCursor({ id: row.id, value, direction, page: targetPage, key })
  }

  return {
    pastes: await summarizePastes(records, viewer),
    query: { ...query, page },
    pagination: {
      page,
      pageCount,
      total,
      totalAll: all?.count ?? 0,
      nextCursor: page < pageCount ? token(records.at(-1), "after", page + 1) : undefined,
      previousCursor: page > 1 ? token(records[0], "before", page - 1) : undefined,
    },
    languageOptions: facets.map((row) => row.language).sort(),
  }
}

// Settings only needs a count; the trash page's storage label is one SQL aggregate.
export async function trashTotals() {
  const viewer = (await getSession())?.user.id
  if (!viewer) return { count: 0, bytes: 0 }
  const [row] = await getDb()
    .select({
      count: sql<number>`count(distinct ${pasteTable.id})::int`,
      bytes: sql<number>`coalesce(sum(octet_length(${pasteFile.content})), 0)::float8`,
    })
    .from(pasteTable)
    .leftJoin(pasteFile, eq(pasteFile.pasteId, pasteTable.id))
    .where(and(eq(pasteTable.ownerId, viewer), isNotNull(pasteTable.deletedAt)))
  return row ?? { count: 0, bytes: 0 }
}
