// Shapes the collection screens read, built from the collection table in ./store.ts.

// The square icons a collection can wear, drawn by components/collections/icon.tsx. Names are
// stored in collection.icon, so keep existing ones when adding more.
export const ICONS = [
  "square",
  "outline",
  "half",
  "diagonal",
  "checker",
  "target",
  "bars",
  "barcode",
  "steps",
  "grid",
  "overlap",
  "corner",
] as const

export type CollectionIcon = (typeof ICONS)[number]

// The colors an icon can take, stored in collection.hue. "ink" and "blue" follow the theme's
// foreground and primary; the rest are fixed.
export const HUES = [
  "ink",
  "blue",
  "sky",
  "teal",
  "green",
  "amber",
  "orange",
  "red",
  "pink",
  "violet",
] as const

export type Hue = (typeof HUES)[number]

// New collections start as a solid square, each in the next hue, so neighbors tell apart.
export const defaultHue = (existing: number): Hue => HUES[(existing + 1) % HUES.length] ?? "blue"

export interface Collection {
  slug: string
  name: string
  icon: CollectionIcon
  hue: Hue
  // Pastes in it, not counting the trash.
  pasteCount: number
}

export const MAX_COLLECTIONS = 50
export const MAX_NAME_LENGTH = 40
