import "server-only"

import { clientAddress } from "@/lib/client-ip"
import { getConfig } from "@/lib/config"

// The browser talks to PostHog through this app (/api/analytics/*), so ad blockers don't drop
// events and the Content-Security-Policy stays 'self'.

const REQUEST_HEADERS = [
  "accept",
  "accept-language",
  "content-type",
  "content-encoding",
  "user-agent",
]
const RESPONSE_HEADERS = ["cache-control", "content-type"]

// us.i.posthog.com serves its scripts from us-assets.i.posthog.com.
export function assetsHost(host: string) {
  return host.replace(/^(https?:\/\/)([\w-]+)\.i\.posthog\.com$/, "$1$2-assets.i.posthog.com")
}

// The PostHog web app for links in the toolbar: us.i.posthog.com -> us.posthog.com.
export function uiHost(host: string) {
  return host.replace(/\.i\.posthog\.com$/, ".posthog.com")
}

export function upstreamUrl(host: string, path: string[], search: string) {
  const base = path[0] === "static" ? assetsHost(host) : host
  return `${base}/${path.map(encodeURIComponent).join("/")}${search}`
}

export async function forwardToPostHog(request: Request, path: string[]) {
  const analytics = getConfig().analytics
  if (!analytics) return new Response(null, { status: 404 })

  // Only what PostHog needs: no cookies or auth headers. The visitor's address goes along so
  // geolocation and cookieless visitor counts see them rather than this server.
  const headers = new Headers()
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  const address = clientAddress(request.headers)
  if (address !== "unknown") headers.set("x-forwarded-for", address)

  const hasBody = request.method !== "GET" && request.method !== "HEAD"
  const upstream = await fetch(upstreamUrl(analytics.host, path, new URL(request.url).search), {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: "manual",
  }).catch(() => null)
  if (!upstream) return new Response(null, { status: 502 })

  const responseHeaders = new Headers()
  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers.get(name)
    if (value) responseHeaders.set(name, value)
  }
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
}
