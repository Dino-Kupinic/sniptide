import "server-only"

import {
  type CodeFile as ApiFile,
  type ApiPaste,
  type ApiPasteSummary,
  apiReplacementSchema,
  apiTagSchema,
  apiCaptureSchema as captureSchema,
  MAX_TAGS,
} from "@sniptide/contracts"

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
  gt,
  ilike,
  inArray,
  isNull,
  lt,
  or,
  type SQL,
  sql,
} from "drizzle-orm"
import { z } from "zod"
import { getDb } from "@/lib/db"
import { announceChange } from "@/lib/live/changes"
import { enforceBudget, PasteBudgetError } from "@/lib/pastes/budget"
import { insertPaste } from "@/lib/pastes/insert"
import { limited, limits } from "@/lib/pastes/limits"
import { parsePasteInput } from "@/lib/pastes/schema"
import { pruneSnapshots, snapshotOf } from "@/lib/pastes/snapshot"
import { randomSlug } from "@/lib/pastes/store"
import { getSiteOrigin } from "@/lib/site"
import { ApiError } from "./http"

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
async function withFiles(records: PasteRecord[]): Promise<ApiPaste[]> {
  if (records.length === 0) return []
  const [files, origin] = await Promise.all([
    getDb()
      .select()
      .from(pasteFile)
      .where(
        inArray(
          pasteFile.pasteId,
          records.map((record) => record.id),
        ),
      )
      .orderBy(asc(pasteFile.position), asc(pasteFile.id)),
    shareOrigin(),
  ])
  return records.map((record) => ({
    ...toSummaryFields(record, origin),
    files: files.filter((file) => file.pasteId === record.id).map(toApiFile),
  }))
}

// The owner's live pastes: not trashed and not expired.
function liveOwned(owner: string): SQL {
  return and(
    eq(pasteTable.ownerId, owner),
    isNull(pasteTable.deletedAt),
    or(isNull(pasteTable.expiresAt), gt(pasteTable.expiresAt, new Date())),
  ) as SQL
}

async function ownsCollection(owner: string, slug: string) {
  const [row] = await getDb()
    .select({ id: collectionTable.id })
    .from(collectionTable)
    .where(and(eq(collectionTable.ownerId, owner), eq(collectionTable.slug, slug)))
  return Boolean(row)
}

// Saves a capture as a new paste. Validation, size limits, the account's storage budget and the
// per-account create limit are the same ones the editor goes through.
export async function createCapture(owner: string, input: unknown): Promise<ApiPaste> {
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
  if (data.collection && !(await ownsCollection(owner, data.collection)))
    throw new ApiError(404, "That collection doesn't exist. Create it in Sniptide first.")
  const tooOften = await limited(limits.create(owner))
  if (tooOften) throw new ApiError(429, tooOften, 60)

  let slug: string
  do slug = randomSlug()
  while (
    (await getDb().select({ id: pasteTable.id }).from(pasteTable).where(eq(pasteTable.slug, slug)))
      .length
  )

  const id = crypto.randomUUID()
  const now = new Date()
  const bytes = data.files.reduce((sum, file) => sum + Buffer.byteLength(file.content, "utf8"), 0)
  try {
    await getDb().transaction(async (tx) => {
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
    })
  } catch (error) {
    if (error instanceof PasteBudgetError) throw new ApiError(413, error.message)
    throw error
  }
  await announceChange(owner)
  const created = await getCapture(owner, id)
  if (!created) throw new Error("A paste that was just created can't be read back.")
  return created
}

// One of the owner's pastes by its id or its slug.
export async function getCapture(owner: string, idOrSlug: string): Promise<ApiPaste | null> {
  const key = UUID.test(idOrSlug) ? eq(pasteTable.id, idOrSlug) : eq(pasteTable.slug, idOrSlug)
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
        .where(and(eq(pasteTable.id, existing.id), liveOwned(owner)))
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
        .where(eq(pasteTable.id, record.id))
      await tx.delete(pasteFile).where(eq(pasteFile.pasteId, record.id))
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

// Postgres keeps microseconds and JavaScript milliseconds, so cursors compare and order on
// timestamps truncated to the millisecond; the id breaks ties.
const ms = (column: typeof pasteTable.updatedAt | typeof pasteTable.createdAt) =>
  sql`date_trunc('milliseconds', ${column})`

const stamp = (iso: string) => sql`${iso}::timestamptz`

interface Cursor {
  at: string
  id: string
}

function encodeCursor(record: PasteRecord, field: "updatedAt" | "createdAt") {
  const cursor: Cursor = { at: record[field].toISOString(), id: record.id }
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

// The owner's pastes, latest edit first, filtered by text in the title or slug, tags (all of
// them), a language any of its files is in, and a collection. One page per call.
export async function listCaptures(
  owner: string,
  query: z.infer<typeof listQuerySchema>,
): Promise<{ pastes: ApiPasteSummary[]; nextCursor: string | null }> {
  const cursor = decodeCursor(query.cursor)
  const conditions: (SQL | undefined)[] = [liveOwned(owner)]
  if (query.q) {
    const pattern = `%${query.q.replace(/[\\%_]/g, "\\$&")}%`
    conditions.push(or(ilike(pasteTable.title, pattern), ilike(pasteTable.slug, pattern)))
  }
  if (query.tags.length) conditions.push(arrayContains(pasteTable.tags, query.tags))
  if (query.collection) conditions.push(eq(pasteTable.collection, query.collection))
  if (query.language) {
    conditions.push(
      exists(
        getDb()
          .select({ id: pasteFile.id })
          .from(pasteFile)
          .where(and(eq(pasteFile.pasteId, pasteTable.id), eq(pasteFile.language, query.language))),
      ),
    )
  }
  if (cursor) {
    const at = stamp(cursor.at)
    conditions.push(
      or(
        lt(ms(pasteTable.updatedAt), at),
        and(eq(ms(pasteTable.updatedAt), at), gt(pasteTable.id, cursor.id)),
      ),
    )
  }
  const records = await getDb()
    .select()
    .from(pasteTable)
    .where(and(...conditions))
    .orderBy(desc(ms(pasteTable.updatedAt)), asc(pasteTable.id))
    .limit(query.limit + 1)
  const page = records.slice(0, query.limit)
  const last = page.at(-1)
  const [files, origin] = await Promise.all([
    page.length
      ? getDb()
          .select({
            pasteId: pasteFile.pasteId,
            language: pasteFile.language,
          })
          .from(pasteFile)
          .where(
            inArray(
              pasteFile.pasteId,
              page.map((record) => record.id),
            ),
          )
          .orderBy(asc(pasteFile.position))
      : [],
    shareOrigin(),
  ])
  return {
    pastes: page.map((record) => {
      const own = files.filter((file) => file.pasteId === record.id)
      return {
        ...toSummaryFields(record, origin),
        languages: [...new Set(own.map((file) => file.language))],
        bytes: record.bytes,
      }
    }),
    nextCursor: records.length > query.limit && last ? encodeCursor(last, "updatedAt") : null,
  }
}

// A collection's pastes in full, oldest first, so a pull restores them in the order they were
// captured. Null when the owner has no such collection.
export async function collectionCaptures(
  owner: string,
  slug: string,
  cursorValue: string | null,
): Promise<{ pastes: ApiPaste[]; nextCursor: string | null } | null> {
  if (!(await ownsCollection(owner, slug))) return null
  const cursor = decodeCursor(cursorValue)
  const records = await getDb()
    .select()
    .from(pasteTable)
    .where(
      and(
        liveOwned(owner),
        eq(pasteTable.collection, slug),
        cursor
          ? or(
              gt(ms(pasteTable.createdAt), stamp(cursor.at)),
              and(eq(ms(pasteTable.createdAt), stamp(cursor.at)), gt(pasteTable.id, cursor.id)),
            )
          : undefined,
      ),
    )
    .orderBy(asc(ms(pasteTable.createdAt)), asc(pasteTable.id))
    .limit(COLLECTION_PAGE_SIZE + 1)
  const page = records.slice(0, COLLECTION_PAGE_SIZE)
  const last = page.at(-1)
  return {
    pastes: await withFiles(page),
    nextCursor:
      records.length > COLLECTION_PAGE_SIZE && last ? encodeCursor(last, "createdAt") : null,
  }
}
