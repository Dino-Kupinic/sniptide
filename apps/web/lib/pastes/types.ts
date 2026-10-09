// Shapes the paste screens read, built from the SQLite tables in ./store.ts.

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
