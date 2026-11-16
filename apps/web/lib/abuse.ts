import "server-only"

import { z } from "zod"

// Keep only the location. URL queries and fragments can carry passwords or encryption keys.
// No user URL is fetched, and a missing/private paste gets the same intake response.
export function abuseTarget(value: unknown, origins: string[]) {
  const input = z.string().max(2048).parse(value)
  const url = new URL(input)
  if (!origins.includes(url.origin) || url.username || url.password)
    throw new Error("Invalid location.")
  const target = decodeURIComponent(url.pathname).replace(/^\//, "").replace(/\/$/, "")
  if (!/^(?:[A-Za-z0-9_-]{1,128}|@[a-z0-9_-]{3,30}\/[A-Za-z0-9_-]{1,40})$/.test(target))
    throw new Error("Invalid location.")
  return target
}
