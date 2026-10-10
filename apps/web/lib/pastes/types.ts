// Shapes the paste screens read, built from the Postgres tables in ./store.ts.

export type Visibility = "public" | "unlisted" | "private"
export type Expiry = "1h" | "1d" | "1w" | "1m" | "never"
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

export interface Paste {
  slug: string
  title: string
  description: string
  files: PasteFile[]
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
  revisions: Revision[]
}

// A paste as the lists and the dashboard show it: no file contents, revisions or password hash.
export interface PasteSummary {
  slug: string
  title: string
  visibility: Visibility
  hasPassword: boolean
  burnAfterRead: boolean
  collection: string | null
  // null means the signed-in viewer owns it.
  owner: Person | null
  views: number
  // Oldest first, today last.
  viewsByDay: number[]
  createdAt: number
  updatedAt: number
  expiresAt: number | null
  deletedAt: number | null
  // The first file's language, and the files' total size in UTF-8 bytes.
  language: string
  bytes: number
  // Whether the signed-in viewer starred it.
  starred: boolean
}

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

export interface SharingInput {
  visibility?: Visibility
  expiry?: Expiry
  password?: string | null
  burnAfterRead?: boolean
  allowRaw?: boolean
}
