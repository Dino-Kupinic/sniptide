import "server-only"

import { pasteFile, paste as pasteTable } from "@workspace/db/schema"
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or, type SQL, sql } from "drizzle-orm"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { PASTE_PAGE_SIZE, type PasteListQuery } from "./list-query"
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
          scope.mode === "trash" ? isNotNull(pasteTable.deletedAt) : isNull(pasteTable.deletedAt),
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
      ? sql`(strpos(lower(${pasteTable.title}), lower(${query.q})) > 0 or strpos(lower(${pasteTable.slug}), lower(${query.q})) > 0)`
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
  const [[all], [matching], facets] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(pasteTable).where(base),
    db.select({ count: sql<number>`count(*)::int` }).from(pasteTable).where(filters),
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
  const records = await db
    .select()
    .from(pasteTable)
    .where(filters)
    .orderBy(
      scope.mode === "trash" ? desc(pasteTable.deletedAt) : orders[query.sort],
      pasteTable.id,
    )
    .limit(PASTE_PAGE_SIZE)
    .offset((page - 1) * PASTE_PAGE_SIZE)
  return {
    pastes: await summarizePastes(records, viewer),
    query: { ...query, page },
    pagination: { page, pageCount, total, totalAll: all?.count ?? 0 },
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
