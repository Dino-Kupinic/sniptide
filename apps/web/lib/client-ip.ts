import { timingSafeEqual } from "node:crypto"

// Which request header names the visitor's address. The default fits the hosted setup, where
// Cloudflare sets CF-Connecting-IP and overwrites any value the client sent. Self-hosters without
// Cloudflare must set CLIENT_IP_HEADER to a header their own proxy controls (x-real-ip, or
// x-forwarded-for to use the last hop it appended), or clients can pick their own address.
export function clientIpHeader() {
  return (process.env.CLIENT_IP_HEADER || "cf-connecting-ip").trim().toLowerCase()
}

// The share domain's own site proxies share pages to this app, so on those requests every
// header above names the site's server. When SHARE_PROXY_SECRET is set, the site can pass the
// visitor's address in X-Sniptide-Client-IP, proven by the same secret in X-Sniptide-Proxy-Secret.
function proxiedAddress(headers: Headers) {
  const secret = process.env.SHARE_PROXY_SECRET
  const sent = headers.get("x-sniptide-proxy-secret")
  const address = headers.get("x-sniptide-client-ip")?.trim()
  if (!secret || !sent || !address) return null

  const expected = Buffer.from(secret)
  const actual = Buffer.from(sent)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  return address
}

// Who is asking, as far as the proxies in front of the app tell us.
export function clientAddress(headers: Headers) {
  const proxied = proxiedAddress(headers)
  if (proxied) return proxied

  const header = clientIpHeader()
  if (header !== "x-forwarded-for") {
    const value = headers.get(header)?.split(",")[0]?.trim()
    if (value) return value
  }

  // The last address in X-Forwarded-For is the one the nearest proxy appended; earlier ones are
  // whatever the client sent.
  const forwarded = headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown"
}
