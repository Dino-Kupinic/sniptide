import "server-only"

import {
  type CodeFile as ApiFile,
  type ApiPaste,
  type ApiPasteSummary,
  apiReplacementSchema,
  apiTagSchema,
  apiCaptureSchema as captureSchema,
  MAX_TAGS,
  visibilitySchema,
} from "@sniptide/contracts"
import type { Database } from "@workspace/db"
import { allowedParent, allowedPaste } from "@workspace/db/moderation"

export {
  type ApiPaste,
  type ApiPasteSummary,
  apiCaptureSchema as captureSchema,
  type CaptureInput,
  type CodeFile as ApiFile,
} from "@sniptide/contracts"

import {
  collection as collectionTable,
  pasteFile,
  pasteRevision,
  paste as pasteTable,
} from "@workspace/db/schema"
import {
  and,
  arrayContains,
  asc,
  desc,
  eq,
  exists,
  getTableColumns,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm"
import { z } from "zod"
import { getDb } from "@/lib/db"
import { announceChange } from "@/lib/live/changes"
import { enforceBudget, PasteBudgetError } from "@/lib/pastes/budget"
import { insertPaste } from "@/lib/pastes/insert"
import { limits } from "@/lib/pastes/limits"
import { hashPassword } from "@/lib/pastes/passwords"
import { parsePasteInput } from "@/lib/pastes/schema"
import { pruneSnapshots, snapshotOf } from "@/lib/pastes/snapshot"
import { expiresAtFor, randomSlug } from "@/lib/pastes/store"
import { EXPIRIES, type Expiry, type Visibility } from "@/lib/pastes/types"
import { hit } from "@/lib/rate-limit"
import { getSiteOrigin } from "@/lib/site"
import { ApiError } from "./http"
import { type CreateReceipt, createWithReceipt } from "./idempotency"

// Pastes over the token API: what `sniptide push`, `pull`, `list` and `search` read and write.
// A token only ever reaches its own account's pastes; trashed and expired ones are left out, as
// they are everywhere outside the owner's own screens.

export const LIST_LIMIT = 100
export const COLLECTION_PAGE_SIZE = 50
export { MAX_TAGS } from "@sniptide/contracts"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type PasteRecord = typeof pasteTable.$inferSelect
type FileRecord = typeof pasteFile.$inferSelect

async function shareOrigin() {
  return (await getSiteOrigin()).origin
}

function toApiFile(file: FileRecord): ApiFile {
  return {
    name: file.name,
    language: file.language,
    content: file.content,
    ...(file.startLine !== null && file.endLine !== null
      ? { lines: { start: file.startLine, end: file.endLine } }
      : {}),
  }
}

function toSummaryFields(record: PasteRecord, origin: string): Omit<ApiPaste, "files"> {
  return {
    id: record.id,
    slug: record.slug,
    url: `${origin}/${record.slug}`,
    title: record.title,
    description: record.description,
    visibility: record.visibility,
    collection: record.collection,
    tags: record.tags,
    source: record.source ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    expiresAt: record.expiresAt?.toISOString() ?? null,
  }
}

// Full pastes for `records`, files in their saved order, in one query.
async function withFiles(
  records: PasteRecord[],
  db: Pick<Database, "select"> = getDb(),
): Promise<ApiPaste[]> {
  if (records.length === 0) return []
  const [files, origin] = await Promise.all([
    db
      .select()
      .from(pasteFile)
      .where(
        and(
          allowedParent(pasteFile.pasteId),
          inArray(
            pasteFile.pasteId,
            records.map((record) => record.id),
          ),
        ),
      )
      .orderBy(asc(pasteFile.position), asc(pasteFile.id)),
    shareOrigin(),
  ])
  const byPaste = new Map<string, ApiFile[]>()
  for (const file of files) {
    const group = byPaste.get(file.pasteId)
    if (group) group.push(toApiFile(file))
    else byPaste.set(file.pasteId, [toApiFile(file)])
  }
  return records.flatMap((record) => {
    const files = byPaste.get(record.id)
    return files ? [{ ...toSummaryFields(record, origin), files }] : []
  })
}

// The owner's live pastes: not trashed and not expired.
function liveOwned(owner: string): SQL {
  return and(
    allowedPaste(),
    eq(pasteTable.ownerId, owner),
    isNull(pasteTable.deletedAt),
    or(isNull(pasteTable.expiresAt), gt(pasteTable.expiresAt, new Date())),
  ) as SQL
}

async function ownsCollection(owner: string, slug: string, db: Pick<Database, "select"> = getDb()) {
  const [row] = await db
    .select({ id: collectionTable.id })
    .from(collectionTable)
    .where(and(eq(collectionTable.ownerId, owner), eq(collectionTable.slug, slug)))
  return Boolean(row)
}

// Saves a capture as a new paste. Validation, size limits, the account's storage budget and the
// per-account create limit are the same ones the editor goes through.
export async function createCapture(
  owner: string,
  input: unknown,
  receipt?: CreateReceipt,
): Promise<ApiPaste> {
  const quota = await hit([limits.create(owner)])
  if (!quota.allowed)
    throw new ApiError(429, "Too many paste creates. Slow down.", quota.retryAfterSeconds)

  try {
    const response = await createWithReceipt(receipt, async (tx) => {
      const capture = captureSchema.parse(input)
      const data = parsePasteInput({
        title: capture.title,
        description: capture.description,
        files: capture.files.map(({ name, content }) => ({ name, content, language: "text" })),
        visibility: capture.visibility,
        expiry: "never",
        slug: "",
        collection: capture.collection,
        password: null,
        burnAfterRead: false,
      })
      if (data.collection && !(await ownsCollection(owner, data.collection, tx)))
        throw new ApiError(404, "That collection doesn't exist. Create it in Sniptide first.")
      let slug: string
      do slug = randomSlug()
      while (
        (await tx.select({ id: pasteTable.id }).from(pasteTable).where(eq(pasteTable.slug, slug)))
          .length
      )

      const id = crypto.randomUUID()
      const now = new Date()
      const bytes = data.files.reduce(
        (sum, file) => sum + Buffer.byteLength(file.content, "utf8"),
        0,
      )
      await enforceBudget(tx, owner, bytes)
      await insertPaste(tx, {
        id,
        slug,
        ownerId: owner,
        title: data.title,
        description: data.description,
        bytes,
        visibility: data.visibility,
        collection: data.collection,
        tags: capture.tags,
        source: capture.source,
        files: data.files.map((file, position) => ({
          name: file.name,
          language: file.language,
          content: file.content,
          startLine: capture.files[position]?.lines?.start ?? null,
          endLine: capture.files[position]?.lines?.end ?? null,
        })),
        createdAt: now,
      })
      const [record] = await tx.select().from(pasteTable).where(eq(pasteTable.id, id))
      if (!record) throw new Error("The created paste wasn't returned.")
      const [created] = await withFiles([record], tx)
      if (!created) throw new Error("The created paste files weren't returned.")
      return { paste: created }
    })
    await announceChange(owner)
    return response.paste
  } catch (error) {
    if (error instanceof PasteBudgetError) throw new ApiError(413, error.message)
    throw error
  }
}

// One of the owner's pastes by its id or its slug.
export async function getCapture(owner: string, idOrSlug: string): Promise<ApiPaste | null> {
  const key = UUID.test(idOrSlug)
    ? and(allowedPaste(), eq(pasteTable.id, idOrSlug))
    : and(allowedPaste(), eq(pasteTable.slug, idOrSlug))
  const [record] = await getDb()
    .select()
    .from(pasteTable)
    .where(and(key, liveOwned(owner)))
  if (!record) return null
  const [paste] = await withFiles([record])
  return paste ?? null
}

// Replaces title/files, preserving omitted metadata and all sharing controls. Token callers
// never use the browser session. The account lock and transaction serialize edits and budgets.
// Counts a read with a token on each paste, for "Read N times through MCP or the CLI" on the
// paste page. Only reads the caller asked for count: never search results or the read-back after
// a write. It changes no version or edit time, so open editors see no conflict.
export async function recordTokenReads(owner: string, ids: string[]) {
  if (ids.length === 0) return
  await getDb()
    .update(pasteTable)
    .set({ agentReads: sql`${pasteTable.agentReads} + 1` })
    .where(and(eq(pasteTable.ownerId, owner), inArray(pasteTable.id, [...new Set(ids)])))
}

export async function updateCapture(
  owner: string,
  idOrSlug: string,
  input: unknown,
): Promise<ApiPaste> {
  const replacement = apiReplacementSchema.parse(input)
  const data = parsePasteInput({
    title: replacement.title,
    description: "",
    files: replacement.files.map(({ name, content }) => ({ name, content, language: "text" })),
    visibility: "private",
    expiry: "keep",
    slug: "",
    collection: null,
    password: "",
    burnAfterRead: false,
  })
  const existing = await getCapture(owner, idOrSlug)
  if (!existing) throw new ApiError(404, "No paste with that id.")
  const bytes = data.files.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0)
  try {
    await getDb().transaction(async (tx) => {
      await enforceBudget(tx, owner, bytes, existing.id)
      const [record] = await tx
        .select()
        .from(pasteTable)
        .where(and(allowedPaste(), eq(pasteTable.id, existing.id), liveOwned(owner)))
        .for("update")
      if (!record) throw new ApiError(404, "No paste with that id.")
      const capture = captureSchema.parse({
        description: record.description,
        visibility: record.visibility,
        collection: record.collection,
        tags: record.tags,
        source: record.source,
        ...replacement,
      })
      const description = z.string().trim().max(280).parse(capture.description)
      if (capture.collection && !(await ownsCollection(owner, capture.collection)))
        throw new ApiError(404, "That collection doesn't exist. Create it in Sniptide first.")
      const now = new Date()
      await tx
        .update(pasteTable)
        .set({
          title: data.title,
          description,
          bytes,
          visibility: capture.visibility,
          collection: capture.collection,
          tags: capture.tags,
          source: capture.source,
          updatedAt: now,
          version: sql`${pasteTable.version} + 1`,
        })
        .where(and(allowedPaste(), eq(pasteTable.id, record.id)))
      await tx
        .delete(pasteFile)
        .where(and(allowedParent(pasteFile.pasteId), eq(pasteFile.pasteId, record.id)))
      await tx.insert(pasteFile).values(
        data.files.map((file, position) => ({
          pasteId: record.id,
          position,
          name: file.name,
          language: file.language,
          content: file.content,
          startLine: capture.files[position]?.lines?.start ?? null,
          endLine: capture.files[position]?.lines?.end ?? null,
        })),
      )
      await tx.insert(pasteRevision).values({
        pasteId: record.id,
        message: "Edited via API",
        snapshot: snapshotOf({ title: data.title, description }, [
          ...data.files.map((file, position) => ({
            ...file,
            startLine: capture.files[position]?.lines?.start ?? null,
            endLine: capture.files[position]?.lines?.end ?? null,
          })),
        ]),
        createdAt: now,
      })
      await pruneSnapshots(tx, record.id)
    })
  } catch (error) {
    if (error instanceof PasteBudgetError) throw new ApiError(413, error.message)
    throw error
  }
  await announceChange(owner)
  const updated = await getCapture(owner, existing.id)
  if (!updated) throw new ApiError(404, "No paste with that id.")
  return updated
}

export const settingsSchema = z
  .object({
    visibility: visibilitySchema.optional(),
    // Counted from now, like the editor's Expires after.
    expiry: z.enum(EXPIRIES).optional(),
    // A new password, or null to remove protection.
    password: z.string().min(1).max(200).nullable().optional(),
    burnAfterRead: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Change at least one of visibility, expiry, password or burnAfterRead.",
  })

export interface ApiSettings {
  visibility: Visibility
  expiresAt: string | null
  passwordProtected: boolean
  burnAfterRead: boolean
}

function settingsOf(record: PasteRecord): ApiSettings {
  return {
    visibility: record.visibility,
    expiresAt: record.expiresAt?.toISOString() ?? null,
    passwordProtected: record.passwordHash !== null,
    burnAfterRead: record.burnAfterRead,
  }
}

async function findLive(owner: string, idOrSlug: string) {
  const key = UUID.test(idOrSlug) ? eq(pasteTable.id, idOrSlug) : eq(pasteTable.slug, idOrSlug)
  const [record] = await getDb()
    .select()
    .from(pasteTable)
    .where(and(key, liveOwned(owner)))
  return record ?? null
}

function expiresAtOrNull(expiry: Expiry) {
  const at = expiresAtFor(expiry)
  return at === null ? null : new Date(at)
}

// Changes how a live paste is shared, the same fields as the editor's sharing panel. The
// password is hashed here and never returned; the response says only whether one is set.
export async function updateSettings(
  owner: string,
  idOrSlug: string,
  input: unknown,
): Promise<{ paste: Omit<ApiPaste, "files">; settings: ApiSettings }> {
  const { expiry, password, ...rest } = settingsSchema.parse(input)
  const existing = await findLive(owner, idOrSlug)
  if (!existing) throw new ApiError(404, "No paste with that id.")
  const [record] = await getDb()
    .update(pasteTable)
    .set({
      ...rest,
      version: sql`${pasteTable.version} + 1`,
      ...(password !== undefined
        ? { passwordHash: password ? await hashPassword(password) : null }
        : {}),
      ...(expiry ? { expiresAt: expiresAtOrNull(expiry) } : {}),
    })
    .where(eq(pasteTable.id, existing.id))
    .returning()
  if (!record) throw new ApiError(404, "No paste with that id.")
  await announceChange(owner)
  return { paste: toSummaryFields(record, await shareOrigin()), settings: settingsOf(record) }
}

// Moves a live paste to the trash, where its owner can restore it until the trash is emptied.
// Tokens never delete for good.
export async function trashCapture(
  owner: string,
  idOrSlug: string,
): Promise<{ trashed: { id: string; slug: string } }> {
  const existing = await findLive(owner, idOrSlug)
  if (!existing) throw new ApiError(404, "No paste with that id.")
  await getDb()
    .update(pasteTable)
    .set({ deletedAt: new Date(), version: sql`${pasteTable.version} + 1` })
    .where(eq(pasteTable.id, existing.id))
  await announceChange(owner)
  return { trashed: { id: existing.id, slug: existing.slug } }
}

type TimestampColumn = typeof pasteTable.updatedAt | typeof pasteTable.createdAt

function cursorColumn(column: TimestampColumn, cursor: Cursor | null) {
  // Existing tokens retain their original ordering until that traversal finishes.
  return cursor && cursor.v !== 2 ? sql`date_trunc('milliseconds', ${column})` : sql`${column}`
}

function preciseTimestamp(column: TimestampColumn) {
  return sql<string>`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
}

const stamp = (iso: string) => sql`${iso}::timestamptz`

interface Cursor {
  at: string
  id: string
  v?: 2
}

function encodeCursor(
  record: PasteRecord & { cursorAt: string },
  field: "updatedAt" | "createdAt",
  previous: Cursor | null,
) {
  const cursor: Cursor =
    previous && previous.v !== 2
      ? { at: record[field].toISOString(), id: record.id }
      : { v: 2, at: record.cursorAt, id: record.id }
  return Buffer.from(JSON.stringify(cursor)).toString("base64url")
}

function decodeCursor(value: string | null): Cursor | null {
  if (!value) return null
  try {
    if (value.length > 256) throw new Error()
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor
    if (
      typeof cursor.at !== "string" ||
      Number.isNaN(Date.parse(cursor.at)) ||
      (cursor.v !== undefined && cursor.v !== 2) ||
      (cursor.v === 2 && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(cursor.at)) ||
      typeof cursor.id !== "string" ||
      !UUID.test(cursor.id)
    )
      throw new Error()
    return cursor
  } catch {
    throw new ApiError(400, "The cursor isn't valid. Start again without it.")
  }
}

export const listQuerySchema = z.object({
  q: z.string().trim().max(120).default(""),
  tags: z.array(apiTagSchema).max(MAX_TAGS).default([]),
  language: z.string().trim().max(40).optional(),
  collection: z.string().trim().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(LIST_LIMIT).default(20),
  cursor: z.string().nullable().default(null),
})

export function parseListQuery(params: URLSearchParams) {
  return listQuerySchema.parse({
    q: params.get("q") ?? undefined,
    tags: params.getAll("tag"),
    language: params.get("language") ?? undefined,
    collection: params.get("collection") ?? undefined,
    limit: params.get("limit") ?? undefined,
    cursor: params.get("cursor"),
  })
}

// At most this many words of a query are matched, so a long query can't build a huge filter.
const MAX_QUERY_WORDS = 8

// A paste matches a query when every word of it appears somewhere in the paste: the title, slug,
// description, a tag, or the path or code of one of its files. Agents search with phrases such
// as "retry with backoff", which rarely sit in a title as written.
function matchesQuery(q: string): SQL | undefined {
  const words = [...new Set(q.toLowerCase().split(/\s+/).filter(Boolean))].slice(0, MAX_QUERY_WORDS)
  return and(
    ...words.map((word) => {
      const pattern = `%${word.replace(/[\\%_]/g, "\\$&")}%`
      return or(
        ilike(pasteTable.title, pattern),
        ilike(pasteTable.slug, pattern),
        ilike(pasteTable.description, pattern),
        sql`array_to_string(${pasteTable.tags}, ' ') ilike ${pattern}`,
        exists(
          getDb()
            .select({ id: pasteFile.id })
            .from(pasteFile)
            .where(
              and(
                eq(pasteFile.pasteId, pasteTable.id),
                or(ilike(pasteFile.name, pattern), ilike(pasteFile.content, pattern)),
              ),
            ),
        ),
      )
    }),
  )
}

// The owner's pastes, latest edit first, filtered by words anywhere in the paste (matchesQuery),
// tags (all of them), a language any of its files is in, and a collection. One page per call.
export async function listCaptures(
  owner: string,
  query: z.infer<typeof listQuerySchema>,
): Promise<{ pastes: ApiPasteSummary[]; nextCursor: string | null }> {
  return getDb().transaction(
    async (db) => {
      const cursor = decodeCursor(query.cursor)
      const updatedAt = cursorColumn(pasteTable.updatedAt, cursor)
      const conditions: (SQL | undefined)[] = [liveOwned(owner)]
      if (query.q) conditions.push(matchesQuery(query.q))
      if (query.tags.length) conditions.push(arrayContains(pasteTable.tags, query.tags))
      if (query.collection) conditions.push(eq(pasteTable.collection, query.collection))
      if (query.language) {
        conditions.push(
          exists(
            db
              .select({ id: pasteFile.id })
              .from(pasteFile)
              .where(
                and(
                  and(allowedParent(pasteFile.pasteId), eq(pasteFile.pasteId, pasteTable.id)),
                  eq(pasteFile.language, query.language),
                ),
              ),
          ),
        )
      }
      if (cursor) {
        const at = stamp(cursor.at)
        conditions.push(
          and(
            lte(updatedAt, at),
            or(lt(updatedAt, at), and(eq(updatedAt, at), gt(pasteTable.id, cursor.id))),
          ),
        )
      }
      const records = await db
        .select({
          ...getTableColumns(pasteTable),
          cursorAt: preciseTimestamp(pasteTable.updatedAt),
        })
        .from(pasteTable)
        .where(and(...conditions))
        .orderBy(desc(updatedAt), asc(pasteTable.id))
        .limit(query.limit + 1)
      const page = records.slice(0, query.limit)
      const [files, origin] = await Promise.all([
        page.length
          ? db
              .select({
                pasteId: pasteFile.pasteId,
                language: pasteFile.language,
              })
              .from(pasteFile)
              .where(
                and(
                  allowedParent(pasteFile.pasteId),
                  inArray(
                    pasteFile.pasteId,
                    page.map((record) => record.id),
                  ),
                ),
              )
              .orderBy(asc(pasteFile.position))
          : [],
        shareOrigin(),
      ])
      const languages = new Map<string, Set<string>>()
      for (const file of files) {
        const group = languages.get(file.pasteId)
        if (group) group.add(file.language)
        else languages.set(file.pasteId, new Set([file.language]))
      }
      const visible = page.filter((record) => languages.has(record.id))
      const last = visible.at(-1)
      return {
        pastes: visible.map((record) => ({
          ...toSummaryFields(record, origin),
          languages: [...(languages.get(record.id) ?? [])],
          bytes: record.bytes,
        })),
        nextCursor:
          records.length > query.limit && last ? encodeCursor(last, "updatedAt", cursor) : null,
      }
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  )
}

// A collection's pastes in full, oldest first, so a pull restores them in the order they were
// captured. Null when the owner has no such collection.
export async function collectionCaptures(
  owner: string,
  slug: string,
  cursorValue: string | null,
): Promise<{ pastes: ApiPaste[]; nextCursor: string | null } | null> {
  if (!(await ownsCollection(owner, slug))) return null
  return getDb().transaction(
    async (db) => {
      const cursor = decodeCursor(cursorValue)
      const createdAt = cursorColumn(pasteTable.createdAt, cursor)
      const records = await db
        .select({
          ...getTableColumns(pasteTable),
          cursorAt: preciseTimestamp(pasteTable.createdAt),
        })
        .from(pasteTable)
        .where(
          and(
            liveOwned(owner),
            eq(pasteTable.collection, slug),
            cursor
              ? and(
                  gte(createdAt, stamp(cursor.at)),
                  or(
                    gt(createdAt, stamp(cursor.at)),
                    and(eq(createdAt, stamp(cursor.at)), gt(pasteTable.id, cursor.id)),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(asc(createdAt), asc(pasteTable.id))
        .limit(COLLECTION_PAGE_SIZE + 1)
      const page = records.slice(0, COLLECTION_PAGE_SIZE)
      const pastes = await withFiles(page, db)
      const lastId = pastes.at(-1)?.id
      const last = page.find((record) => record.id === lastId)
      return {
        pastes,
        nextCursor:
          records.length > COLLECTION_PAGE_SIZE && last
            ? encodeCursor(last, "createdAt", cursor)
            : null,
      }
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  )
}
