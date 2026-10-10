import { timingSafeEqual } from "node:crypto"
import { type IncomingMessage, Server } from "node:http"
import { BlockList, isIP } from "node:net"

// Where the visitor's address comes from, for rate limits. Set CLIENT_IP_SOURCE to match what
// sits in front of the app (see apps/web/.env.example):
//
// - direct: nothing; the TCP peer is the visitor. The default, because no header can fake it.
//   Behind a proxy it names the proxy, so every visitor shares one limit until it's changed.
// - x-forwarded-for: a reverse proxy that appends to X-Forwarded-For (nginx, Caddy, Traefik).
//   TRUSTED_PROXIES or TRUSTED_PROXY_HOPS says which entries the proxies wrote.
// - x-real-ip: a reverse proxy that sets X-Real-IP to the address it saw.
// - cloudflare: Cloudflare's CF-Connecting-IP, for an origin that only Cloudflare can reach.
//
// Each falls back to the TCP peer when its header is missing or isn't an address.
export const CLIENT_IP_SOURCES = ["direct", "x-forwarded-for", "x-real-ip", "cloudflare"] as const
export type ClientIpSource = (typeof CLIENT_IP_SOURCES)[number]

// Set by this server on every request (see recordPeerAddresses), never taken from the client.
export const PEER_ADDRESS_HEADER = "x-sniptide-peer-address"
// The resolved address, set by the auth route for better-auth's own limits.
export const RESOLVED_IP_HEADER = "x-sniptide-resolved-ip"

const PRIVATE_RANGES = [
  "127.0.0.0/8",
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "169.254.0.0/16",
  "::1/128",
  "fc00::/7",
  "fe80::/10",
]

interface ClientIpConfig {
  source: ClientIpSource
  hops: number
  trusted: BlockList | null
}

let cached: { key: string; config: ClientIpConfig } | undefined

function addRange(list: BlockList, range: string) {
  const [address = "", prefix] = range.split("/")
  const family = isIP(address)
  if (!family) throw new Error(`TRUSTED_PROXIES: "${range}" is not an IP address or CIDR range.`)
  const type = family === 4 ? "ipv4" : "ipv6"
  if (prefix === undefined) return list.addAddress(address, type)
  const bits = Number(prefix)
  if (!Number.isInteger(bits) || bits < 0 || bits > (family === 4 ? 32 : 128)) {
    throw new Error(`TRUSTED_PROXIES: "${range}" has an invalid prefix length.`)
  }
  list.addSubnet(address, bits, type)
}

// The client-IP settings from the environment. Throws on a value it doesn't understand, so a typo
// fails startup (every request, the health check included, errors) instead of quietly trusting the
// wrong header.
export function clientIpConfig(): ClientIpConfig {
  const { CLIENT_IP_SOURCE, TRUSTED_PROXY_HOPS, TRUSTED_PROXIES } = process.env
  const key = `${CLIENT_IP_SOURCE}|${TRUSTED_PROXY_HOPS}|${TRUSTED_PROXIES}`
  if (cached?.key === key) return cached.config

  const source = (CLIENT_IP_SOURCE?.trim().toLowerCase() || "direct") as ClientIpSource
  if (!CLIENT_IP_SOURCES.includes(source)) {
    throw new Error(`CLIENT_IP_SOURCE must be one of ${CLIENT_IP_SOURCES.join(", ")}.`)
  }

  const hops = TRUSTED_PROXY_HOPS?.trim() ? Number(TRUSTED_PROXY_HOPS) : 1
  if (!Number.isInteger(hops) || hops < 1) {
    throw new Error("TRUSTED_PROXY_HOPS must be a whole number of at least 1.")
  }

  const ranges = (TRUSTED_PROXIES ?? "")
    .split(",")
    .map((range) => range.trim())
    .filter(Boolean)
  let trusted: BlockList | null = null
  if (ranges.length > 0) {
    trusted = new BlockList()
    for (const range of ranges) {
      for (const each of range.toLowerCase() === "private" ? PRIVATE_RANGES : [range]) {
        addRange(trusted, each)
      }
    }
  }

  const config = { source, hops, trusted }
  cached = { key, config }
  return config
}

// A valid address in its plain form ("::ffff:192.0.2.1" becomes "192.0.2.1"), or null.
function normalize(value: string | null | undefined) {
  const address = value?.trim()
  if (!address) return null
  const mapped = address.toLowerCase().startsWith("::ffff:") ? address.slice(7) : null
  if (mapped && isIP(mapped) === 4) return mapped
  return isIP(address) ? address : null
}

function isTrusted(list: BlockList, address: string) {
  return list.check(address, isIP(address) === 4 ? "ipv4" : "ipv6")
}

// Next.js doesn't hand route handlers the socket, and only fills in X-Forwarded-For when the
// client sent none, so the TCP peer is recorded here instead: every request the server receives
// gets PEER_ADDRESS_HEADER set (overwriting anything the client sent). Called once at startup.
const installed = Symbol.for("sniptide.peerAddresses")
export function recordPeerAddresses() {
  const state = globalThis as typeof globalThis & { [installed]?: boolean }
  if (state[installed]) return
  state[installed] = true

  const emit = Server.prototype.emit
  Server.prototype.emit = function (this: Server, event: string | symbol, ...args: unknown[]) {
    if (event === "request") {
      const [request] = args as [IncomingMessage]
      request.headers[PEER_ADDRESS_HEADER] = request.socket.remoteAddress ?? ""
    }
    return emit.call(this, event, ...args)
  } as typeof Server.prototype.emit
}

function peerAddress(headers: Headers) {
  const state = globalThis as typeof globalThis & { [installed]?: boolean }
  return state[installed] ? normalize(headers.get(PEER_ADDRESS_HEADER)) : null
}

// The address X-Forwarded-For vouches for. With TRUSTED_PROXIES, walk the chain (ending with the
// TCP peer) from the right and take the first address that isn't a trusted proxy; a peer that
// isn't trusted means the request didn't come through one, so it's the visitor. Otherwise take
// the TRUSTED_PROXY_HOPS-th entry from the right, one per proxy that appended to the header.
function forwardedAddress(headers: Headers, config: ClientIpConfig, peer: string | null) {
  const chain = (headers.get("x-forwarded-for") ?? "").split(",").map(normalize)

  if (config.trusted) {
    if (peer && !isTrusted(config.trusted, peer)) return peer
    for (const address of [...chain].reverse()) {
      if (!address) return null
      if (!isTrusted(config.trusted, address)) return address
    }
    return null
  }

  return chain.length >= config.hops ? (chain[chain.length - config.hops] ?? null) : null
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

// Who is asking, as far as the configured source can tell, or "unknown".
export function clientAddress(headers: Headers) {
  const proxied = proxiedAddress(headers)
  if (proxied) return proxied

  const config = clientIpConfig()
  const peer = peerAddress(headers)
  const fromSource =
    config.source === "cloudflare"
      ? normalize(headers.get("cf-connecting-ip"))
      : config.source === "x-real-ip"
        ? normalize(headers.get("x-real-ip"))
        : config.source === "x-forwarded-for"
          ? forwardedAddress(headers, config, peer)
          : null
  return fromSource ?? peer ?? "unknown"
}

// Request headers for better-auth, carrying the resolved address in RESOLVED_IP_HEADER (and
// dropping any copy the client sent), since better-auth can't apply the rules above itself.
export function withResolvedIp(headers: Headers) {
  const result = new Headers(headers)
  result.delete(RESOLVED_IP_HEADER)
  const address = clientAddress(headers)
  if (address !== "unknown") result.set(RESOLVED_IP_HEADER, address)
  return result
}
