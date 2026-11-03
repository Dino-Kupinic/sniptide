import { DAY } from "@/lib/time"
import type { Expiry } from "./types"

const EXPIRY_MS: Record<Exclude<Expiry, "never">, number> = {
  "1h": 3_600_000,
  "1d": DAY,
  "1w": 7 * DAY,
  "1m": 30 * DAY,
  "1y": 365 * DAY,
}

export const SLUG_PATTERN = /^[A-Za-z0-9_-]{3,40}$/

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
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")
}
