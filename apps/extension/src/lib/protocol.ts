import type { CaptureInput, Collection, Paste, PasteSummary, Visibility } from "@sniptide/sdk"

// What the popup and the toasts ask the background worker to do. The worker owns the tokens, so
// every request to Sniptide goes through it and a refresh never races another one.

export const HOSTED_INSTANCE = "https://app.sniptide.com"
export const EXPIRIES = ["never", "1h", "1d", "1w", "1m", "1y"] as const
export type Expiry = (typeof EXPIRIES)[number]

export interface Settings {
  // Visibility of a paste saved from the context menu or the shortcut, and the composer's start.
  visibility: Visibility
  // Whether a new paste's description names the page it came from.
  includeSource: boolean
}

// Unlisted, so the copied link opens for whoever receives it without listing the paste anywhere.
export const DEFAULT_SETTINGS: Settings = { visibility: "unlisted", includeSource: true }

export interface Account {
  instance: string
  name: string
  username: string | null
  canWrite: boolean
}

export interface State {
  settings: Settings
  account: Account | null
}

export type Request =
  | { type: "state" }
  | { type: "signIn"; instance: string }
  | { type: "signOut" }
  | { type: "settings"; settings: Partial<Settings> }
  | { type: "create"; input: CaptureInput; expiry: Expiry; key: string }
  | { type: "recent"; query: string }
  | { type: "collections" }
  | { type: "undo"; pasteId: string }

export interface Replies {
  state: State
  signIn: State
  signOut: State
  settings: State
  // `warning` reports a paste that was saved without the expiry the reader asked for.
  create: { paste: Paste; warning: string | null }
  recent: PasteSummary[]
  collections: Collection[]
  undo: null
}

export type Reply<T> = { ok: true; value: T } | { ok: false; error: string; code: string }
