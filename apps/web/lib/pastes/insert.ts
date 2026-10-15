import "server-only"

import type { Database } from "@workspace/db"
import {
  type PasteSource,
  pasteFile,
  pasteRevision,
  paste as pasteTable,
} from "@workspace/db/schema"
import type { Visibility } from "./types"

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]

export interface InsertedFile {
  name: string
  language: string
  content: string
  startLine?: number | null
  endLine?: number | null
}

// The parsed paste, already checked. Callers keep auth, rate limits, and slug checks.
export interface InsertedPaste {
  id: string
  slug: string
  ownerId: string
  title: string
  description: string
  bytes: number
  visibility: Visibility
  collection: string | null
  passwordHash?: string | null
  burnAfterRead?: boolean
  expiresAt?: Date | null
  tags?: string[]
  source?: PasteSource | null
  files: InsertedFile[]
  createdAt: Date
}

export async function insertPaste(tx: Transaction, paste: InsertedPaste) {
  await tx.insert(pasteTable).values({
    id: paste.id,
    slug: paste.slug,
    ownerId: paste.ownerId,
    title: paste.title,
    description: paste.description,
    bytes: paste.bytes,
    visibility: paste.visibility,
    passwordHash: paste.passwordHash ?? null,
    burnAfterRead: paste.burnAfterRead ?? false,
    collection: paste.collection,
    tags: paste.tags ?? [],
    source: paste.source ?? null,
    createdAt: paste.createdAt,
    updatedAt: paste.createdAt,
    expiresAt: paste.expiresAt ?? null,
  })
  if (paste.files.length > 0) {
    await tx.insert(pasteFile).values(
      paste.files.map((file, position) => ({
        pasteId: paste.id,
        position,
        name: file.name,
        language: file.language,
        content: file.content,
        startLine: file.startLine ?? null,
        endLine: file.endLine ?? null,
      })),
    )
  }
  await tx.insert(pasteRevision).values({
    pasteId: paste.id,
    message: "Created",
    createdAt: paste.createdAt,
  })
}
