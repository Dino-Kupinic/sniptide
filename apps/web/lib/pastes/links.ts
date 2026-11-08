import { isNamespace } from "@workspace/auth/username"
import { DAY } from "@/lib/time"
import type { Expiry } from "./types"

const EXPIRY_MS: Record<Exclude<Expiry, "never">, number> = {
  "1h": 3_600_000,
  "1d": DAY,
  "1w": 7 * DAY,
  "1m": 30 * DAY,
  "1y": 365 * DAY,
}

// One link segment: a generated link, a top-level link made before namespaces, or the name part
// of a custom link.
export const SLUG_PATTERN = /^[A-Za-z0-9_-]{3,40}$/

// Pages served below a link (/<link>/raw) and the editor's /pastes/<link>/edit. A custom link
// name can't be one of them, so /<generated>/raw and /<handle>/<name> never share an address.
export const LINK_SUBPATHS: ReadonlySet<string> = new Set([
  "copy",
  "edit",
  "embed",
  "preview",
  "print",
  "raw",
  "reveal",
  "unlock",
])

// Custom links live in their owner's namespace: sniptide.com/<handle>/<name>. The slug column
// stores "<handle>/<name>", so every `/${slug}` address already points at the right place.
export function customLink(handle: string, name: string) {
  return `${handle}/${name}`
}

// The name part of `slug` when it is a custom link in `handle`'s namespace, otherwise "".
export function customLinkName(slug: string, handle: string | null | undefined) {
  if (!handle || !slug.startsWith(`${handle}/`)) return ""
  return slug.slice(handle.length + 1)
}

export function isLinkName(name: string) {
  return SLUG_PATTERN.test(name) && !LINK_SUBPATHS.has(name.toLowerCase())
}

// Whether `slug` is a custom link `handle` may claim. Handles that collide with an app route
// can't hold links, because /<handle>/<name> would reach that route instead.
export function isCustomLink(slug: string, handle: string | null | undefined) {
  if (!handle || !isNamespace(handle)) return false
  const name = customLinkName(slug, handle)
  return isLinkName(name)
}

// Next.js matches one segment per dynamic folder, so the proxy serves /<handle>/<name> from the
// internal route segment "<handle>~<name>". "~" can't appear in a handle or a link name.
export const ROUTE_SEPARATOR = "~"

export function slugFromRoute(segment: string) {
  return segment.replace(ROUTE_SEPARATOR, "/")
}

export function routeSegment(slug: string) {
  return slug.replace("/", ROUTE_SEPARATOR)
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
