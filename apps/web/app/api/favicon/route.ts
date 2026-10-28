import { getSession } from "@/lib/auth"
import { hit } from "@/lib/rate-limit"
import { HOUR_SECONDS } from "@/lib/time"

// Referrer favicons for the analytics page, fetched by the server from Google's favicon service.
// The browser only talks to this app, so a visitor's IP address never reaches Google (the same
// reason fonts are self-hosted). Signed in only, so it can't serve as an open proxy.

const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
const MAX_BYTES = 64 * 1024

export async function GET(request: Request) {
  const domain = (new URL(request.url).searchParams.get("domain") ?? "").toLowerCase()
  if (!HOSTNAME.test(domain)) return new Response(null, { status: 400 })

  const session = await getSession()
  if (!session) return new Response(null, { status: 401 })
  const allowance = await hit([
    { key: `favicon:${session.user.id}`, max: 600, windowSeconds: HOUR_SECONDS },
  ])
  if (!allowance.allowed) return new Response(null, { status: 429 })

  const upstream = await fetch(
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`,
    { signal: AbortSignal.timeout(5_000), redirect: "follow", cache: "no-store" },
  ).catch(() => null)
  const type = upstream?.headers.get("content-type") ?? ""
  if (!upstream?.ok || !type.startsWith("image/") || type.includes("svg"))
    return new Response(null, { status: 404 })
  const body = await upstream.arrayBuffer()
  if (body.byteLength > MAX_BYTES) return new Response(null, { status: 404 })

  return new Response(body, {
    headers: {
      "content-type": type,
      "cache-control": "private, max-age=604800",
      "x-content-type-options": "nosniff",
    },
  })
}
