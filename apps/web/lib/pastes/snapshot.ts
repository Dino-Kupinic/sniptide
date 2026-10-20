import "server-only"

import type { Database } from "@workspace/db"
import { pasteRevision, type RevisionSnapshot } from "@workspace/db/schema"
import { sql } from "drizzle-orm"

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]

// Revisions keep a copy of the paste so it can be rolled back. Only the newest ones do, so a paste
// edited for years doesn't carry hundreds of copies; older entries stay in the history as a log.
export const SNAPSHOT_LIMIT = 20

export function snapshotOf(
  paste: { title: string; description: string },
  files: RevisionSnapshot["files"],
): RevisionSnapshot {
  return {
    title: paste.title,
    description: paste.description,
    files: files.map(({ name, language, content, startLine, endLine }) => ({
      name,
      language,
      content,
      startLine: startLine ?? null,
      endLine: endLine ?? null,
    })),
  }
}

export async function pruneSnapshots(tx: Transaction, pasteId: string) {
  await tx.execute(sql`
    update ${pasteRevision} set snapshot = null
    where ${pasteRevision.pasteId} = ${pasteId}
      and ${pasteRevision.snapshot} is not null
      and ${pasteRevision.id} not in (
        select id from ${pasteRevision}
        where ${pasteRevision.pasteId} = ${pasteId} and ${pasteRevision.snapshot} is not null
        order by ${pasteRevision.createdAt} desc, ${pasteRevision.id} desc
        limit ${SNAPSHOT_LIMIT}
      )
  `)
}
