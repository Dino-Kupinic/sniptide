// A seconds count and a millisecond count are both numbers. Branding them means a copied
// `60 * 60` cannot be stored where an epoch delta belongs, which would expire a paste in
// 3.6 seconds instead of one hour.

declare const millisecondsBrand: unique symbol
declare const secondsBrand: unique symbol

export type Milliseconds = number & { readonly [millisecondsBrand]: never }
export type Seconds = number & { readonly [secondsBrand]: never }

export function milliseconds(value: number): Milliseconds {
  return value as Milliseconds
}

export function seconds(value: number): Seconds {
  return value as Seconds
}

// Durations in milliseconds, for working with the epoch times the screens use.
export const MINUTE = milliseconds(60_000)
export const HOUR = milliseconds(60 * 60_000)
export const DAY = milliseconds(24 * 60 * 60_000)

// Durations in seconds, for rate-limit windows stored as intervals.
export const HOUR_SECONDS = seconds(60 * 60)
