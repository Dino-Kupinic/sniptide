// Shapes the paste screens read, built from the Postgres tables in ./store.ts.

import type { AgentClient } from "@/lib/onboarding"

// The values themselves, for the schemas that check input. The database's visibility enum
// (packages/db/src/schema/pastes.ts) holds the same three.
export const VISIBILITIES = ["public", "unlisted", "private"] as const
export const EXPIRIES = ["1h", "1d", "1w", "1m", "1y", "never"] as const

export type Visibility = (typeof VISIBILITIES)[number]
export type Expiry = (typeof EXPIRIES)[number]
export const ACCESSES = ["view", "edit"] as const
export type Access = (typeof ACCESSES)[number]

export interface PasteFile {
  name: string
  language: string
  content: string
}

export interface Person {
  // What the screens show after "@": the chosen spelling of the handle, or the name when the
  // account has none.
  username: string
  // The normalized handle behind the profile link (/@<handle>), or null when there is no profile.
  handle: string | null
  name: string
  initials: string
  // Avatar fill from the Shared with me design: primary, ink or muted.
  tone: "primary" | "foreground" | "muted"
}

export interface Revision {
  id: number
  message: string
  createdAt: number
  // False for history from before copies were kept, and for entries too old to keep one.
  restorable: boolean
}

// What the lists read: a paste without its file contents or revision history.
export interface PasteCreator {
  via: "api" | "mcp" | "cli"
  agent: AgentClient | null
}

export interface PasteSummary {
  slug: string
  title: string
  description: string
  // The first file's language, and the size of all files together in bytes.
  language: string
  bytes: number
  visibility: Visibility
  // The stored password hash; set means the paste is password-protected.
  password: string | null
  burnAfterRead: boolean
  allowRaw: boolean
  // Set on an end-to-end encrypted paste: the public id of the key a browser needs to read it.
  // Its one file then holds ciphertext, and its description is inside that ciphertext.
  encryptionKeyId: string | null
  collection: string | null
  // null means the signed-in viewer owns it.
  owner: Person | null
  // Who owns it, whoever is looking.
  author: Person
  views: number
  uniqueViews: number
  // Reads with an API token (MCP or the CLI), counted apart from views.
  agentReads: number
  // How it was created when not in the web editor, and by which connected agent if one made it.
  createdBy: PasteCreator | null
  // Oldest first, today last.
  viewsByDay: number[]
  createdAt: number
  updatedAt: number
  expiresAt: number | null
  deletedAt: number | null
  // When its one read burned it. Only set while a burned paste is in the trash.
  burnedAt: number | null
}

// One paste in full, for the screens that show or edit its content.
export interface Paste extends PasteSummary {
  version: number
  files: PasteFile[]
  revisions: Revision[]
  revisionCount: number
  revisionPage: number
  revisionPageCount: number
}

// Public reads carry the fields the share page renders, without owner-only history or hashes.
export type SharedPaste = Pick<
  Paste,
  | "slug"
  | "title"
  | "files"
  | "author"
  | "updatedAt"
  | "expiresAt"
  | "views"
  | "burnAfterRead"
  | "allowRaw"
  | "encryptionKeyId"
>

export interface Share {
  slug: string
  access: Access
  sharedAt: number
}

// Someone a paste is shared with, as its owner's share dialog lists them.
export interface SharePerson {
  id: string
  name: string
  // Their @username, or their email when they have none.
  handle: string
  initials: string
  access: Access
  sharedAt: number
}

// A person to invite when a paste is created, already looked up by the editor.
export interface ShareInvite {
  userId: string
  access: Access
}

export interface PasteInput {
  title: string
  description: string
  files: PasteFile[]
  visibility: Visibility
  // "keep" leaves an edited paste's expiry where it was.
  expiry: Expiry | "keep"
  slug: string
  collection: string | null
  password: string | null
  burnAfterRead: boolean
  // Set when the browser encrypted the paste: `files` is then the one ciphertext file.
  encryption?: { keyId: string } | null
}

// The sidebar's counts next to My pastes, Starred and Shared with me.
export interface NavCounts {
  pastes: number
  starred: number
  shared: number
}

// A paste as the sidebar lists it: just enough for its row and its ⋯ menu.
export interface SidebarPaste {
  expiresAt: number | null
  slug: string
  title: string
  // The viewer's own paste, so it can be renamed, filed and deleted from the sidebar.
  owned: boolean
  starred: boolean
  collection: string | null
  updatedAt: number
  encryptionKeyId: string | null
}

export interface SidebarData {
  counts: NavCounts
  // The viewer's most recently updated pastes, and the first of their starred ones.
  recent: SidebarPaste[]
  starred: SidebarPaste[]
}

// What the ⌘K command menu finds for a query: the viewer's own pastes by title or slug.
export interface PasteSearchHit {
  slug: string
  title: string
  updatedAt: number
}

export interface PasteSearchResult {
  hits: PasteSearchHit[]
  // Every match, which can be more than the hits returned.
  total: number
}

export const PASTE_SEARCH_LIMIT = 8
export const PASTE_SEARCH_MAX_LENGTH = 120

export const SIDEBAR_RECENT = 8
export const SIDEBAR_STARRED = 3

export interface SharingInput {
  visibility?: Visibility
  expiry?: Expiry
  password?: string | null
  burnAfterRead?: boolean
  allowRaw?: boolean
}
