import "server-only"

import { allowedParent, allowedPaste } from "@workspace/db/moderation"

import { pasteFile, pasteShare, paste as pasteTable, user } from "@workspace/db/schema"
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
import { z } from "zod"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { initials } from "@/lib/format"
import { DAY } from "@/lib/time"
import { cursorKey, decodeCursor, encodeCursor } from "./cursor"
import { PASTE_PAGE_SIZE, type PasteListQuery } from "./list-query"
import { TRASH_DAYS } from "./purge"
import type { SharedListQuery } from "./shared-list-query"
import { purgeTrash, readableStarsWhere, sharedWithWhere, summarizePastes } from "./store"
import type { Person } from "./types"

export interface PasteListScope {
  mode: "mine" | "starred" | "collection" | "folder" | "trash"
  collection?: string
  // The folder's id, for mode "folder": the pastes filed directly in it.
  folder?: string
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
  return getDb().transaction(
    async (db) => {
      const language = db
        .select({ language: pasteFile.language })
        .from(pasteFile)
        .where(and(allowedParent(pasteFile.pasteId), eq(pasteFile.pasteId, pasteTable.id)))
        .orderBy(pasteFile.position, pasteFile.id)
        .limit(1)
      const firstLanguage = sql<string>`coalesce((${language}), 'text')`
      const base =
        scope.mode === "starred"
          ? await readableStarsWhere(viewer)
          : and(
              allowedPaste(),
              eq(pasteTable.ownerId, viewer),
              scope.mode === "trash"
                ? gte(pasteTable.deletedAt, new Date(Date.now() - TRASH_DAYS * DAY))
                : and(allowedPaste(), isNull(pasteTable.deletedAt)),
              scope.mode === "collection"
                ? eq(pasteTable.collection, scope.collection ?? "")
                : undefined,
              // An id that isn't a uuid matches nothing, rather than failing the query.
              scope.mode === "folder"
                ? scope.folder && z.uuid().safeParse(scope.folder).success
                  ? eq(pasteTable.folderId, scope.folder)
                  : sql`false`
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
          ? and(
              allowedPaste(),
              eq(pasteTable.ownerId, viewer),
              inArray(pasteTable.collection, query.collections),
            )
          : undefined,
        query.owner === "mine"
          ? and(allowedPaste(), eq(pasteTable.ownerId, viewer))
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
      const ascending =
        scope.mode !== "trash" && (query.sort === "title" || query.sort === "expires")
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

      const pastes = await summarizePastes(records, viewer, db)
      const visibleSlugs = new Set(pastes.map((paste) => paste.slug))
      const visibleRecords = records.filter((record) => visibleSlugs.has(record.slug))
      return {
        pastes,
        query: { ...query, page },
        pagination: {
          page,
          pageCount,
          total,
          totalAll: all?.count ?? 0,
          nextCursor:
            page < pageCount ? token(visibleRecords.at(-1), "after", page + 1) : undefined,
          previousCursor: page > 1 ? token(visibleRecords[0], "before", page - 1) : undefined,
        },
        languageOptions: facets.map((row) => row.language).sort(),
      }
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  )
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
    .leftJoin(
      pasteFile,
      and(allowedParent(pasteFile.pasteId), eq(pasteFile.pasteId, pasteTable.id)),
    )
    .where(and(allowedPaste(), eq(pasteTable.ownerId, viewer), isNotNull(pasteTable.deletedAt)))
  return row ?? { count: 0, bytes: 0 }
}

export async function listSharedPage(query: SharedListQuery) {
  const viewer = (await getSession())?.user.id
  if (!viewer)
    return {
      entries: [],
      query: { ...query, page: 1 },
      pagination: { page: 1, pageCount: 1, total: 0, totalAll: 0 },
      languageOptions: [] as string[],
      ownerOptions: [] as (Person & { id: string })[],
      peopleCount: 0,
    }
  return getDb().transaction(
    async (db) => {
      const language = db
        .select({ language: pasteFile.language })
        .from(pasteFile)
        .where(and(allowedParent(pasteFile.pasteId), eq(pasteFile.pasteId, pasteTable.id)))
        .orderBy(pasteFile.position, pasteFile.id)
        .limit(1)
      const firstLanguage = sql<string>`coalesce((${language}), 'text')`
      const base = sharedWithWhere(viewer)
      const needle = `%${query.q.replace(/[\\%_]/g, "\\$&")}%`
      const filters = and(
        base,
        query.q ? or(ilike(pasteTable.title, needle), ilike(pasteTable.slug, needle)) : undefined,
        query.languages.length ? inArray(firstLanguage, query.languages) : undefined,
        query.owners.length ? inArray(pasteTable.ownerId, query.owners) : undefined,
        query.access.length ? inArray(pasteShare.access, query.access) : undefined,
      )
      const [[all], [matching], languages, owners] = await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(pasteShare)
          .innerJoin(
            pasteTable,
            and(allowedParent(pasteShare.pasteId), eq(pasteShare.pasteId, pasteTable.id)),
          )
          .where(base),
        db
          .select({
            count: sql<number>`count(*)::int`,
            people: sql<number>`count(distinct ${pasteTable.ownerId})::int`,
          })
          .from(pasteShare)
          .innerJoin(
            pasteTable,
            and(allowedParent(pasteShare.pasteId), eq(pasteShare.pasteId, pasteTable.id)),
          )
          .where(filters),
        db
          .selectDistinct({ language: firstLanguage })
          .from(pasteShare)
          .innerJoin(
            pasteTable,
            and(allowedParent(pasteShare.pasteId), eq(pasteShare.pasteId, pasteTable.id)),
          )
          .where(base),
        db
          .selectDistinct({
            id: user.id,
            name: user.name,
            username: user.username,
            displayUsername: user.displayUsername,
          })
          .from(pasteShare)
          .innerJoin(
            pasteTable,
            and(allowedParent(pasteShare.pasteId), eq(pasteShare.pasteId, pasteTable.id)),
          )
          .innerJoin(user, eq(user.id, pasteTable.ownerId))
          .where(base)
          .orderBy(user.name, user.id),
      ])
      const total = matching?.count ?? 0
      const pageCount = Math.max(1, Math.ceil(total / PASTE_PAGE_SIZE))
      const page = Math.min(query.page, pageCount)
      const orders: Record<SharedListQuery["sort"], SQL> = {
        shared: desc(pasteShare.createdAt),
        updated: desc(pasteTable.updatedAt),
        title: asc(sql`lower(${pasteTable.title})`),
      }
      const records = await db
        .select({ paste: pasteTable, share: pasteShare })
        .from(pasteShare)
        .innerJoin(
          pasteTable,
          and(allowedParent(pasteShare.pasteId), eq(pasteShare.pasteId, pasteTable.id)),
        )
        .where(filters)
        .orderBy(orders[query.sort], asc(pasteTable.id))
        .limit(PASTE_PAGE_SIZE)
        .offset((page - 1) * PASTE_PAGE_SIZE)
      const summaries = await summarizePastes(
        records.map(({ paste }) => paste),
        viewer,
        db,
      )
      return {
        entries: records.flatMap(({ paste, share }) => {
          const summary = summaries.find((summary) => summary.slug === paste.slug)
          return summary
            ? [
                {
                  paste: summary,
                  share: {
                    slug: paste.slug,
                    access: share.access,
                    sharedAt: share.createdAt.getTime(),
                    seen: share.seenAt !== null,
                  },
                },
              ]
            : []
        }),
        query: { ...query, page },
        pagination: { page, pageCount, total, totalAll: all?.count ?? 0 },
        languageOptions: languages.map(({ language }) => language).sort(),
        ownerOptions: owners.map((owner) => ({
          id: owner.id,
          name: owner.name,
          username: owner.displayUsername ?? owner.username ?? owner.name,
          initials: initials(owner.name),
          tone: "foreground" as const,
        })),
        peopleCount: matching?.people ?? 0,
      }
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  )
}
