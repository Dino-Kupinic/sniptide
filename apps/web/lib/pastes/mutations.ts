import "server-only"

import type { Database } from "@workspace/db"
import { allowedParent, allowedPaste } from "@workspace/db/moderation"
import {
  collection,
  type PasteSource,
  pasteFile,
  pasteRevision,
  pasteShare,
  paste as pasteTable,
  user,
} from "@workspace/db/schema"
import { and, desc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm"
import { enforceBudget, lockAccount, PasteBudgetError } from "./budget"
import { isLargeEdit } from "./edit-size"
import { type InsertedFile, insertPaste } from "./insert"
import { randomSlug, resolveExpiry } from "./links"
import { hashPassword } from "./passwords"
import { pruneSnapshots, snapshotOf } from "./snapshot"
import type { PasteInput, ShareInvite, SharingInput, Visibility } from "./types"

export type PasteTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0]
export type PasteKey = { id: string } | { slug: string }
type PasteRecord = typeof pasteTable.$inferSelect
type SessionActor = { kind: "session"; userId: string }
type TokenActor = { kind: "token"; userId: string }
export type PasteActor = SessionActor | TokenActor

export interface CaptureData {
  title: string
  description: string
  files: InsertedFile[]
  visibility: Visibility
  collection: string | null
  tags: string[]
  source: PasteSource | null
}

export type CaptureReplacement = Pick<CaptureData, "title" | "files"> &
  Partial<Omit<CaptureData, "title" | "files">>

export class PasteCollectionError extends Error {
  constructor() {
    super("That collection doesn't exist. Create it in Sniptide first.")
  }
}

export const REVISION_WINDOW_MS = 10 * 60_000
export interface UpdateOptions {
  expectedVersion?: number
  batchRevision?: boolean
}

export type UpdateResult =
  | { slug: string; version: number; expiresAt: number | null; hasPassword: boolean }
  | { conflict: true; version: number; slug: string }

type SavedUpdate = {
  id: string
  slug: string
  version: number
  expiresAt: number | null
  hasPassword: boolean
}
type MutationUpdateResult = SavedUpdate | { conflict: true; version: number; slug: string }

type CreateRequest =
  | {
      kind: "editor"
      actor: SessionActor
      input: PasteInput
      passwordHash: string | null
      invites: ShareInvite[]
    }
  | { kind: "capture"; actor: TokenActor; input: CaptureData }

type ReplaceRequest =
  | {
      kind: "editor"
      actor: SessionActor
      input: PasteInput
      passwordHash: string | null
      message: string
      options: UpdateOptions
    }
  | { kind: "capture"; actor: TokenActor; input: CaptureReplacement }

function keyWhere(key: PasteKey) {
  return "id" in key ? eq(pasteTable.id, key.id) : eq(pasteTable.slug, key.slug)
}

function expired(record: PasteRecord) {
  return record.expiresAt !== null && record.expiresAt.getTime() <= Date.now()
}

async function checkCollection(tx: PasteTransaction, owner: string, slug: string | null) {
  if (!slug) return
  const [found] = await tx
    .select({ id: collection.id })
    .from(collection)
    .where(and(eq(collection.ownerId, owner), eq(collection.slug, slug)))
  if (!found) throw new PasteCollectionError()
}

async function lockContentRecord(tx: PasteTransaction, actor: PasteActor, key: PasteKey) {
  const [identity] = await tx
    .select({ id: pasteTable.id, ownerId: pasteTable.ownerId })
    .from(pasteTable)
    .where(and(keyWhere(key), allowedPaste()))
  if (!identity) return null
  if (actor.kind === "token" && identity.ownerId !== actor.userId) return null
  await lockAccount(tx, identity.ownerId)
  const [record] = await tx
    .select()
    .from(pasteTable)
    .where(and(eq(pasteTable.id, identity.id), allowedPaste()))
    .for("update")
  return record ?? null
}

async function lockEditable(tx: PasteTransaction, actor: PasteActor, key: PasteKey) {
  const record = await lockContentRecord(tx, actor, key)
  if (!record || record.deletedAt) return null
  if (record.ownerId === actor.userId) {
    if (actor.kind === "token" && expired(record)) return null
    return { record, owned: true }
  }
  if (actor.kind === "token" || expired(record) || record.burnAfterRead) return null
  const [share] = await tx
    .select({ access: pasteShare.access })
    .from(pasteShare)
    .where(
      and(
        allowedParent(pasteShare.pasteId),
        eq(pasteShare.pasteId, record.id),
        eq(pasteShare.userId, actor.userId),
        isNull(pasteShare.leftAt),
      ),
    )
  return share?.access === "edit" ? { record, owned: false } : null
}

export async function createPasteRecord(tx: PasteTransaction, request: CreateRequest) {
  const owner = request.actor.userId
  const input = request.input
  if (request.kind === "capture") await checkCollection(tx, owner, input.collection)
  let slug = request.kind === "editor" ? request.input.slug : ""
  if (!slug) {
    do slug = randomSlug()
    while (
      (await tx.select({ id: pasteTable.id }).from(pasteTable).where(eq(pasteTable.slug, slug)))
        .length
    )
  }
  const now = new Date()
  const id = crypto.randomUUID()
  const bytes = input.files.reduce((sum, file) => sum + Buffer.byteLength(file.content, "utf8"), 0)
  await enforceBudget(tx, owner, bytes)
  await insertPaste(tx, {
    id,
    slug,
    ownerId: owner,
    title: input.title,
    description: input.description,
    bytes,
    visibility: input.visibility,
    collection: input.collection,
    files: input.files,
    createdAt: now,
    ...(request.kind === "editor"
      ? {
          passwordHash: request.passwordHash,
          burnAfterRead: request.input.burnAfterRead,
          expiresAt: resolveExpiry(request.input.expiry, null, now.getTime()),
        }
      : { tags: request.input.tags, source: request.input.source }),
  })
  if (request.kind === "editor") {
    const wanted = new Map(
      request.invites.filter((invite) => invite.userId !== owner).map((i) => [i.userId, i.access]),
    )
    if (wanted.size) {
      const people = await tx
        .select({ id: user.id })
        .from(user)
        .where(inArray(user.id, [...wanted.keys()]))
      if (people.length) {
        await tx.insert(pasteShare).values(
          people.map((person) => ({
            pasteId: id,
            userId: person.id,
            access: wanted.get(person.id) ?? "view",
            createdAt: now,
          })),
        )
      }
    }
  }
  return { id, slug }
}

export async function replacePaste(
  tx: PasteTransaction,
  key: PasteKey,
  request: ReplaceRequest,
): Promise<MutationUpdateResult | null> {
  const editable = await lockEditable(tx, request.actor, key)
  if (!editable) return null
  const { record, owned } = editable
  const now = new Date()
  const editor = request.kind === "editor" ? request : null
  const capture = request.kind === "capture" ? request.input : null
  if (capture?.collection !== undefined)
    await checkCollection(tx, record.ownerId, capture.collection)
  const input = request.input
  const description = input.description ?? record.description
  const passwordHash =
    editor && owned && editor.input.password !== "" ? editor.passwordHash : record.passwordHash
  const expiresAt =
    editor && owned
      ? resolveExpiry(editor.input.expiry, record.expiresAt, now.getTime())
      : record.expiresAt
  const slug = editor && owned ? editor.input.slug || record.slug : record.slug
  const stamp = editor ? new Date(Math.max(now.getTime(), record.updatedAt.getTime() + 1)) : now
  const bytes = input.files.reduce((sum, file) => sum + Buffer.byteLength(file.content, "utf8"), 0)
  await enforceBudget(tx, record.ownerId, bytes, record.id)
  const [changed] = await tx
    .update(pasteTable)
    .set({
      title: input.title,
      description,
      bytes,
      ...(editor && owned
        ? {
            slug,
            visibility: editor.input.visibility,
            passwordHash,
            burnAfterRead: editor.input.burnAfterRead,
            collection: editor.input.collection,
            expiresAt,
          }
        : {}),
      ...(capture
        ? {
            visibility: capture.visibility ?? record.visibility,
            collection: capture.collection === undefined ? record.collection : capture.collection,
            tags: capture.tags ?? record.tags,
            source: capture.source === undefined ? record.source : capture.source,
          }
        : {}),
      updatedAt: stamp,
      version: sql`${pasteTable.version} + 1`,
    })
    .where(
      and(
        allowedPaste(),
        eq(pasteTable.id, record.id),
        editor?.options.expectedVersion === undefined
          ? undefined
          : eq(pasteTable.version, editor.options.expectedVersion),
      ),
    )
    .returning({ version: pasteTable.version })
  if (!changed) return { conflict: true, version: record.version, slug: record.slug }

  const before = await tx
    .select()
    .from(pasteFile)
    .where(and(allowedParent(pasteFile.pasteId), eq(pasteFile.pasteId, record.id)))
  const files = input.files.map((file): InsertedFile => {
    if (!editor) return file
    const original = before.find((old) => old.name === file.name && old.content === file.content)
    return { ...file, startLine: original?.startLine ?? null, endLine: original?.endLine ?? null }
  })
  await tx
    .delete(pasteFile)
    .where(and(allowedParent(pasteFile.pasteId), eq(pasteFile.pasteId, record.id)))
  await tx
    .insert(pasteFile)
    .values(files.map((file, position) => ({ pasteId: record.id, position, ...file })))
  const [latest] = editor?.options.batchRevision
    ? await tx
        .select()
        .from(pasteRevision)
        .where(and(allowedParent(pasteRevision.pasteId), eq(pasteRevision.pasteId, record.id)))
        .orderBy(desc(pasteRevision.createdAt), desc(pasteRevision.id))
        .limit(1)
    : []
  const message = editor?.message ?? "Edited via API"
  const batched =
    editor?.options.batchRevision &&
    latest?.message === message &&
    !latest.sealed &&
    now.getTime() - latest.createdAt.getTime() < REVISION_WINDOW_MS &&
    !isLargeEdit(before, files)
  const snapshot = snapshotOf({ title: input.title, description }, files)
  if (batched && latest)
    await tx.update(pasteRevision).set({ snapshot }).where(eq(pasteRevision.id, latest.id))
  else {
    await tx
      .insert(pasteRevision)
      .values({ pasteId: record.id, message, snapshot, createdAt: stamp })
    await pruneSnapshots(tx, record.id)
  }
  return {
    id: record.id,
    slug,
    version: changed.version,
    expiresAt: expiresAt?.getTime() ?? null,
    hasPassword: passwordHash !== null,
  }
}

async function lockOwnedPasteRow(
  tx: PasteTransaction,
  actor: PasteActor,
  key: PasteKey,
  includeRestricted = false,
) {
  const [record] = await tx
    .select()
    .from(pasteTable)
    .where(
      and(
        keyWhere(key),
        eq(pasteTable.ownerId, actor.userId),
        includeRestricted ? undefined : allowedPaste(),
        actor.kind === "token" ? isNull(pasteTable.deletedAt) : undefined,
      ),
    )
    .for("update")
  return record ?? null
}

export async function changePasteSharing(
  tx: PasteTransaction,
  actor: PasteActor,
  key: PasteKey,
  input: SharingInput,
) {
  const { expiry, password, ...rest } = input
  const passwordHash =
    password !== undefined ? (password ? await hashPassword(password) : null) : undefined
  const record = await lockOwnedPasteRow(tx, actor, key)
  if (
    !record ||
    record.ownerId !== actor.userId ||
    record.deletedAt ||
    (actor.kind === "token" && expired(record))
  )
    return null
  const [changed] = await tx
    .update(pasteTable)
    .set({
      ...rest,
      version: sql`${pasteTable.version} + 1`,
      ...(passwordHash !== undefined ? { passwordHash } : {}),
      ...(expiry ? { expiresAt: resolveExpiry(expiry, record.expiresAt, Date.now()) } : {}),
    })
    .where(and(allowedPaste(), eq(pasteTable.id, record.id)))
    .returning({ id: pasteTable.id, slug: pasteTable.slug })
  return changed ?? null
}

export async function trashPasteRecord(tx: PasteTransaction, actor: PasteActor, key: PasteKey) {
  const record = await lockOwnedPasteRow(tx, actor, key, actor.kind === "session")
  if (
    !record ||
    record.ownerId !== actor.userId ||
    (actor.kind === "token" && (record.deletedAt || expired(record)))
  )
    return null
  await tx
    .update(pasteTable)
    .set({ deletedAt: new Date(), version: sql`${pasteTable.version} + 1` })
    .where(eq(pasteTable.id, record.id))
  return { id: record.id, slug: record.slug }
}

export async function sealPasteRevision(
  tx: PasteTransaction,
  actor: SessionActor,
  key: PasteKey,
  message: string,
): Promise<boolean> {
  const editable = await lockEditable(tx, actor, key)
  if (!editable) return false
  const [latest] = await tx
    .select({ id: pasteRevision.id, message: pasteRevision.message })
    .from(pasteRevision)
    .where(eq(pasteRevision.pasteId, editable.record.id))
    .orderBy(desc(pasteRevision.createdAt), desc(pasteRevision.id))
    .limit(1)
  if (latest?.message === message) {
    await tx.update(pasteRevision).set({ sealed: true }).where(eq(pasteRevision.id, latest.id))
  }
  return true
}

export async function restorePasteRevision(
  tx: PasteTransaction,
  actor: SessionActor,
  key: PasteKey,
  revisionId: number,
): Promise<RestoreResult> {
  const editable = await lockEditable(tx, actor, key)
  if (!editable) return { ok: false, error: "That paste no longer exists." }
  const { record } = editable

  const [target] = await tx
    .select()
    .from(pasteRevision)
    .where(
      and(
        eq(pasteRevision.id, revisionId),
        and(allowedParent(pasteRevision.pasteId), eq(pasteRevision.pasteId, record.id)),
      ),
    )
  const snapshot = target?.snapshot
  if (!target || !snapshot || snapshot.files.length === 0) {
    return { ok: false, error: "That version can't be restored." }
  }

  const [newest] = await tx
    .select({ id: pasteRevision.id })
    .from(pasteRevision)
    .where(and(allowedParent(pasteRevision.pasteId), eq(pasteRevision.pasteId, record.id)))
    .orderBy(desc(pasteRevision.createdAt), desc(pasteRevision.id))
    .limit(1)
  if (newest?.id === target.id) return { ok: false, error: "That is the current version." }

  const [position] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(pasteRevision)
    .where(
      and(
        and(allowedParent(pasteRevision.pasteId), eq(pasteRevision.pasteId, record.id)),
        or(
          lt(pasteRevision.createdAt, target.createdAt),
          and(eq(pasteRevision.createdAt, target.createdAt), lte(pasteRevision.id, target.id)),
        ),
      ),
    )

  const bytes = snapshot.files.reduce(
    (sum, file) => sum + Buffer.byteLength(file.content, "utf8"),
    0,
  )
  try {
    await enforceBudget(tx, record.ownerId, bytes, record.id)
  } catch (error) {
    if (error instanceof PasteBudgetError) return { ok: false, error: error.message }
    throw error
  }

  const version = record.version + 1
  const stamp = new Date(Math.max(Date.now(), record.updatedAt.getTime() + 1))
  await tx
    .update(pasteTable)
    .set({
      title: snapshot.title,
      description: snapshot.description,
      bytes,
      updatedAt: stamp,
      version: sql`${pasteTable.version} + 1`,
    })
    .where(and(allowedPaste(), eq(pasteTable.id, record.id)))
  await tx
    .delete(pasteFile)
    .where(and(allowedParent(pasteFile.pasteId), eq(pasteFile.pasteId, record.id)))
  await tx.insert(pasteFile).values(
    snapshot.files.map((file, index) => ({
      pasteId: record.id,
      position: index,
      name: file.name,
      language: file.language,
      content: file.content,
      startLine: file.startLine ?? null,
      endLine: file.endLine ?? null,
    })),
  )
  await tx.insert(pasteRevision).values({
    pasteId: record.id,
    message: `Restored revision ${position?.count ?? 0}`,
    snapshot,
    createdAt: stamp,
  })
  await pruneSnapshots(tx, record.id)
  return { ok: true, slug: record.slug, version }
}

export type RestoreResult =
  | { ok: true; slug: string; version: number }
  | { ok: false; error: string }
