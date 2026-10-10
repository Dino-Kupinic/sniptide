// Shapes the paste screens read, built from the Postgres tables in ./store.ts.

// The values themselves, for the schemas that check input. The database's visibility enum
// (packages/db/src/schema/pastes.ts) holds the same three.
export const VISIBILITIES = ["public", "unlisted", "private"] as const
export const EXPIRIES = ["1h", "1d", "1w", "1m", "never"] as const

export type Visibility = (typeof VISIBILITIES)[number]
export type Expiry = (typeof EXPIRIES)[number]
export type Access = "edit" | "view"

export interface PasteFile {
  name: string
  language: string
  content: string
}

export interface Person {
  username: string
  name: string
  initials: string
  // Avatar fill from the Shared with me design: primary, ink or muted.
  tone: "primary" | "foreground" | "muted"
}

export interface Revision {
  message: string
  createdAt: number
}

// What the lists read: a paste without its file contents or revision history.
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
  collection: string | null
  // null means the signed-in viewer owns it.
  owner: Person | null
  // Who owns it, whoever is looking.
  author: Person
  views: number
  uniqueViews: number
  // Oldest first, today last.
  viewsByDay: number[]
  createdAt: number
  updatedAt: number
  expiresAt: number | null
  deletedAt: number | null
}

// One paste in full, for the screens that show or edit its content.
export interface Paste extends PasteSummary {
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
>

export interface Share {
  slug: string
  access: Access
  sharedAt: number
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
}

// The sidebar's counts next to My pastes, Starred and Shared with me.
export interface NavCounts {
  pastes: number
  starred: number
  shared: number
}

// A paste as the sidebar lists it: just enough for its row and its ⋯ menu.
export interface SidebarPaste {
  slug: string
  title: string
  // The viewer's own paste, so it can be renamed, filed and deleted from the sidebar.
  owned: boolean
  starred: boolean
  collection: string | null
}

export interface SidebarData {
  counts: NavCounts
  // The viewer's most recently updated pastes, and the first of their starred ones.
  recent: SidebarPaste[]
  starred: SidebarPaste[]
}

export const SIDEBAR_RECENT = 8
export const SIDEBAR_STARRED = 3

export interface SharingInput {
  visibility?: Visibility
  expiry?: Expiry
  password?: string | null
  burnAfterRead?: boolean
  allowRaw?: boolean
}
