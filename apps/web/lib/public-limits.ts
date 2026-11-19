import "server-only"

import { clientAddress } from "@/lib/client-ip"
import { hit } from "@/lib/rate-limit"
import { seconds } from "@/lib/time"

// Public reads, event writes and image renders have per-visitor limits. Password attempts
// have a separate, tighter limit in app/[slug]/unlock/route.ts.
//
// Every visitor behind a proxy shares one address until CLIENT_IP_SOURCE matches the proxy (see
// lib/client-ip.ts), so a request whose address is unknown is let through instead of pooled.

const LIMITS = {
  raw: 120,
  markdown: 120,
  copy: 30,
  preview: 60,
  reveal: 30,
} as const

export type PublicRoute = keyof typeof LIMITS

// How many seconds this visitor has to wait when it has used up the minute's allowance for
// `route`, otherwise null. The route answers 429 in whatever shape its clients expect.
export async function retryAfterSeconds(request: Request, route: PublicRoute) {
  const address = clientAddress(request.headers)
  if (address === "unknown") return null

  const attempt = await hit([
    { key: `public:${route}:${address}`, max: LIMITS[route], windowSeconds: seconds(60) },
  ])
  return attempt.allowed ? null : attempt.retryAfterSeconds
}
