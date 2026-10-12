import { userAgent } from "next/server"

// What a request says about the visitor, for the analytics events (events.ts). Everything here is
// read off the request's headers and kept coarse on purpose: a device class, the referrer's host
// and a country. Pure functions, so they're tested without a database.

export const DEVICES = ["desktop", "mobile", "cli"] as const
export type Device = (typeof DEVICES)[number]

// Link unfurlers and search crawlers are caught by Next's list; this adds the headless browsers
// and uptime checkers that pass for people, and the prefetches browsers make before anyone has
// looked at the page.
const AUTOMATED = /headless|lighthouse|pagespeed|pingdom|uptimerobot|statuscake|monitor/i
const PREFETCH_HEADERS = ["next-router-prefetch", "x-moz", "x-purpose"] as const

// Command-line tools and HTTP libraries. They fetch raw files on purpose, so they count as
// "CLI and API" hits, but they don't read the share page.
const CLI =
  /^(curl|wget|httpie|libwww|python-requests|python-urllib|aiohttp|httpx|go-http-client|node-fetch|undici|axios|got|okhttp|java\/|php|ruby|postmanruntime|insomnia|powershell)/i

function prefetching(headers: Headers) {
  const purpose = `${headers.get("purpose") ?? ""} ${headers.get("sec-purpose") ?? ""}`
  return /prefetch|prerender/i.test(purpose) || PREFETCH_HEADERS.some((name) => headers.has(name))
}

// Crawlers, unfurlers, monitors, prefetches and requests with no user agent at all. Nothing from
// these is recorded.
export function isAutomated(headers: Headers) {
  const agent = headers.get("user-agent")?.trim()
  if (!agent) return true
  return userAgent({ headers }).isBot || AUTOMATED.test(agent) || prefetching(headers)
}

export function deviceOf(headers: Headers): Device {
  const agent = headers.get("user-agent")?.trim() ?? ""
  if (CLI.test(agent)) return "cli"
  const type = userAgent({ headers }).device.type
  return type === "mobile" || type === "tablet" ? "mobile" : "desktop"
}

// Someone reading the share page in a browser. A script that fetches the page's HTML isn't a
// reader; the raw route is where those belong.
export function isHumanVisit(headers: Headers) {
  return !isAutomated(headers) && deviceOf(headers) !== "cli"
}

// The host of the Referer header ("news.ycombinator.com"), or null for a direct visit, a
// same-site click, a private-network address or anything that isn't a web page. The path and
// query are dropped: they can carry tokens, and a host is all the page shows.
export function referrerHost(referer: string | null, ownHosts: Iterable<string>) {
  if (!referer) return null
  let url: URL
  try {
    url = new URL(referer)
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null

  const host = url.hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "")
  // IPv4 and IPv6 literals (the URL parser keeps brackets on the latter).
  if (!host.includes(".") || host.startsWith("[") || /^\d+(\.\d+){3}$/.test(host)) return null
  if (host.length > 100) return null

  for (const own of ownHosts) {
    const name = own
      .split(":")[0]
      ?.toLowerCase()
      .replace(/^www\./, "")
    if (name === host) return null
  }
  return host
}

// The visitor's country as a CDN reports it (Cloudflare, Vercel or CloudFront), uppercase ISO
// 3166-1 alpha-2. Without one of those in front, there is no country: the app doesn't look
// addresses up itself.
export function countryOf(headers: Headers) {
  const value =
    headers.get("cf-ipcountry") ??
    headers.get("x-vercel-ip-country") ??
    headers.get("cloudfront-viewer-country")
  const code = value?.trim().toUpperCase()
  // Cloudflare's XX (unknown) and T1 (Tor) aren't countries.
  return code && /^[A-Z]{2}$/.test(code) && code !== "XX" ? code : null
}
