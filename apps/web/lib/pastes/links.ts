import { isValidUsername } from "@workspace/auth/username"
import { DAY } from "@/lib/time"
import type { Expiry } from "./types"

const EXPIRY_MS: Record<Exclude<Expiry, "never">, number> = {
  "1h": 3_600_000,
  "1d": DAY,
  "1w": 7 * DAY,
  "1m": 30 * DAY,
  "1y": 365 * DAY,
}

// The name part of a custom link. Names only have to be unique within their owner's handle, so
// one character is enough.
export const LINK_NAME_PATTERN = /^[A-Za-z0-9_-]{1,40}$/

// Custom links live under their owner's handle: sniptide.com/@<handle>/<name>. The "@" keeps the
// first path segment free for generated slugs and app routes. The slug column stores
// "@<handle>/<name>", so every `/${slug}` address already points at the right place.
export function customLink(handle: string, name: string) {
  return `@${handle}/${name}`
}

// The name part of `slug` when it is a custom link under `handle`, otherwise "".
export function customLinkName(slug: string, handle: string | null | undefined) {
  if (!handle || !slug.startsWith(`@${handle}/`)) return ""
  return slug.slice(handle.length + 2)
}

// Whether `slug` is a custom link `handle` may claim.
export function isCustomLink(slug: string, handle: string | null | undefined) {
  if (!handle || !isValidUsername(handle)) return false
  return LINK_NAME_PATTERN.test(customLinkName(slug, handle))
}

// Next.js matches one segment per dynamic folder, so the proxy serves /@<handle>/<name> from the
// internal route segment "<handle>~<name>". "~" can't appear in a handle, a link name or a
// generated slug.
export const ROUTE_SEPARATOR = "~"

export function slugFromRoute(segment: string) {
  return segment.includes(ROUTE_SEPARATOR) ? `@${segment.replace(ROUTE_SEPARATOR, "/")}` : segment
}

export function routeSegment(slug: string) {
  return slug.startsWith("@") ? slug.slice(1).replace("/", ROUTE_SEPARATOR) : slug
}

export function expiresAtFor(expiry: Expiry, from = Date.now()) {
  return expiry === "never" ? null : from + EXPIRY_MS[expiry]
}

export function resolveExpiry(expiry: Expiry | "keep", current: Date | null, from: number) {
  return expiry === "keep"
    ? current
    : expiry === "never"
      ? null
      : new Date(from + EXPIRY_MS[expiry])
}

export function randomSlug() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
  const length = 8
  const bytes = new Uint8Array(length * 2)
  // Each character gets the same number of possible bytes; discard the uneven tail.
  const ceiling = 256 - (256 % alphabet.length)
  let slug = ""
  while (slug.length < length) {
    crypto.getRandomValues(bytes)
    for (const byte of bytes) {
      if (byte >= ceiling) continue
      slug += alphabet[byte % alphabet.length]
      if (slug.length === length) break
    }
  }
  return slug
}
