import "server-only"

import { headers } from "next/headers"

// Origin of the current request, so share links read localhost:3000/k7Qe2x in dev and
// sniptide.com/k7Qe2x in production without extra config.
export async function getSiteOrigin() {
  const requestHeaders = await headers()
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "sniptide.com"
  const protocol =
    requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")

  return { origin: `${protocol}://${host}`, host }
}
