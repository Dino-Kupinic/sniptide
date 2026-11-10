import "server-only"

import { clientAddress } from "@/lib/client-ip"
import { getConfig } from "@/lib/config"
import { BodyTooLargeError, readBody } from "@/lib/request-body"

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
const MAX_BODY_BYTES = 1024 * 1024

// us.i.posthog.com serves its scripts from us-assets.i.posthog.com.
export function assetsHost(host: string) {
  return host.replace(/^(https?:\/\/)([\w-]+)\.i\.posthog\.com$/, "$1$2-assets.i.posthog.com")
}

// The PostHog web app for links in the toolbar: us.i.posthog.com -> us.posthog.com.
export function uiHost(host: string) {
  return host.replace(/\.i\.posthog\.com$/, ".posthog.com")
}

// Which hosts may report to PostHog. Preview deployments (pr-NNN.sniptide.com,
// NN.sniptide.com) and local development would pollute the production project, so they
// receive no key and their events are dropped. Everything else keeps working:
// app.sniptide.com, the sniptide.com share pages, and self-hosted instances on their
// own domains.
export function isAnalyticsHost(hostname: string) {
  const host = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
  if (["localhost", "127.0.0.1", "::1", "0:0:0:0:0:0:0:1"].includes(host)) return false
  return !/^(?:pr-\d+|\d{1,3})\.sniptide\.com$/.test(host)
}

export function upstreamUrl(host: string, path: string[], search: string) {
  const base = path[0] === "static" ? assetsHost(host) : host
  return `${base}/${path.map(encodeURIComponent).join("/")}${search}`
}

export async function forwardToPostHog(request: Request, path: string[]) {
  const analytics = getConfig().analytics
  const hostname = new URL(request.url).hostname
  if (!analytics || !isAnalyticsHost(hostname)) return new Response(null, { status: 404 })

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
  let body: ArrayBuffer | undefined
  try {
    if (hasBody) body = await readBody(request, MAX_BODY_BYTES)
  } catch (error) {
    return new Response(null, { status: error instanceof BodyTooLargeError ? 413 : 400 })
  }
  const upstream = await fetch(upstreamUrl(analytics.host, path, new URL(request.url).search), {
    method: request.method,
    headers,
    body,
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
