// Shapes the collection screens read, built from the collection table in ./store.ts.

export const MARKERS = [
  "filled-primary",
  "filled-foreground",
  "outline-primary",
  "outline-foreground",
] as const

export type Marker = (typeof MARKERS)[number]

export interface Collection {
  slug: string
  name: string
  marker: Marker
  // Pastes in it, not counting the trash.
  pasteCount: number
}

export const MAX_COLLECTIONS = 50
export const MAX_NAME_LENGTH = 40
