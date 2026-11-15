// Where a paste is in its life, from one place. The paste row stores it across `deletedAt`,
// `burnedAt` and `expiresAt`; every reader asks here instead of combining the columns itself.
//
//   live ──expiry passes──▶ expired ──owner sets a new expiry──▶ live
//   live ──owner trashes──▶ trashed ──Restore──▶ live (expired if its expiry passed meanwhile)
//   live ──first reveal of a burn paste──▶ burned ──Restore──▶ live, private, burn after read off
//
// The purge job deletes trashed and burned pastes TRASH_DAYS after they reached the trash, and
// expired pastes outside the trash TRASH_DAYS after they expired (lib/pastes/purge.ts). Moderation
// (`allowedPaste()`) overlays every state: a withheld paste is hidden whatever its state.
import { paste as pasteTable } from "@workspace/db/schema"
import { and, gt, isNull, or } from "drizzle-orm"

export type PasteState = "live" | "expired" | "trashed" | "burned"

type LifecycleFields = {
  deletedAt: Date | null
  burnedAt: Date | null
  expiresAt: Date | null
}

export function pasteState(record: LifecycleFields, now = Date.now()): PasteState {
  if (record.deletedAt) return record.burnedAt ? "burned" : "trashed"
  if (record.expiresAt !== null && record.expiresAt.getTime() <= now) return "expired"
  return "live"
}

export function isLive(record: LifecycleFields, now = Date.now()) {
  return pasteState(record, now) === "live"
}

// The SQL form of an unexpired paste, for queries that filter many rows.
export function unexpiredWhere(now = new Date()) {
  return or(isNull(pasteTable.expiresAt), gt(pasteTable.expiresAt, now))
}

// The SQL form of `isLive`.
export function liveWhere(now = new Date()) {
  return and(isNull(pasteTable.deletedAt), unexpiredWhere(now))
}

// Whether anyone holding the link can read the paste with no session, password, reveal step or key.
// Link previews, embeds and channel webhooks only ever show these, even to the owner.
export function openToAnyone(record: {
  visibility: "public" | "unlisted" | "private"
  passwordHash: string | null
  burnAfterRead: boolean
  encryptionKeyId: string | null
}) {
  // An encrypted paste needs the key from the link's fragment, which none of those surfaces has.
  return (
    record.visibility !== "private" &&
    !record.passwordHash &&
    !record.burnAfterRead &&
    !record.encryptionKeyId
  )
}

// What Restore writes. A burned paste was read once already, so it comes back for its owner
// only: private, with burn after read off, so the link never opens a second time.
export function restoredFields(record: Pick<LifecycleFields, "burnedAt">) {
  return record.burnedAt
    ? {
        deletedAt: null,
        burnedAt: null,
        burnAfterRead: false,
        visibility: "private" as const,
      }
    : { deletedAt: null }
}
