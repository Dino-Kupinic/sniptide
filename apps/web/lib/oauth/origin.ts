import "server-only"

import { headers } from "next/headers"

// The app's origin inside a page, where there's no Request: BETTER_AUTH_URL when it's set, as
// appOrigin() uses, otherwise the host the request came to.
export async function pageOrigin() {
  if (process.env.BETTER_AUTH_URL) return new URL(process.env.BETTER_AUTH_URL).origin
  const requestHeaders = await headers()
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000"
  const protocol =
    requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  return `${protocol}://${host}`
}
