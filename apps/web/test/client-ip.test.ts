import { afterEach, beforeAll, describe, expect, test } from "bun:test"
import {
  clientAddress,
  clientIpConfig,
  PEER_ADDRESS_HEADER,
  RESOLVED_IP_HEADER,
  recordPeerAddresses,
  withResolvedIp,
} from "@/lib/client-ip"

// The address the rate limits key on: the one the configured source vouches for, never one the
// client can choose.

const env = { ...process.env }
beforeAll(recordPeerAddresses)
afterEach(() => {
  process.env = { ...env }
})

const from = (headers: Record<string, string>) => clientAddress(new Headers(headers))
const use = (vars: Record<string, string>) => Object.assign(process.env, vars)
const peer = (address: string) => ({ [PEER_ADDRESS_HEADER]: address })

describe("clientAddress", () => {
  describe("direct (the default)", () => {
    test("uses the TCP peer and ignores every forwarding header", () => {
      delete process.env.CLIENT_IP_SOURCE
      expect(
        from({
          ...peer("203.0.113.5"),
          "x-forwarded-for": "6.6.6.6",
          "x-real-ip": "6.6.6.6",
          "cf-connecting-ip": "6.6.6.6",
        }),
      ).toBe("203.0.113.5")
    })

    test("unwraps IPv4-mapped IPv6 peers, and is unknown without one", () => {
      expect(from(peer("::ffff:203.0.113.6"))).toBe("203.0.113.6")
      expect(from(peer("2001:db8::1"))).toBe("2001:db8::1")
      expect(from({ "x-forwarded-for": "6.6.6.6" })).toBe("unknown")
    })
  })

  describe("cloudflare", () => {
    test("uses CF-Connecting-IP, whatever X-Forwarded-For says", () => {
      use({ CLIENT_IP_SOURCE: "cloudflare" })
      expect(
        from({
          ...peer("172.70.0.1"),
          "cf-connecting-ip": "198.51.100.4",
          "x-forwarded-for": "1.1.1.1, 172.70.0.1",
        }),
      ).toBe("198.51.100.4")
    })

    test("falls back to the peer when the header is missing or not an address", () => {
      use({ CLIENT_IP_SOURCE: "cloudflare" })
      expect(from(peer("203.0.113.7"))).toBe("203.0.113.7")
      expect(from({ ...peer("203.0.113.7"), "cf-connecting-ip": "nonsense" })).toBe("203.0.113.7")
    })
  })

  test("x-real-ip uses X-Real-IP", () => {
    use({ CLIENT_IP_SOURCE: "x-real-ip" })
    expect(
      from({ ...peer("10.0.0.2"), "x-real-ip": "203.0.113.9", "cf-connecting-ip": "6.6.6.6" }),
    ).toBe("203.0.113.9")
    expect(from(peer("10.0.0.2"))).toBe("10.0.0.2")
  })

  describe("x-forwarded-for", () => {
    test("takes the entry the last proxy appended by default", () => {
      use({ CLIENT_IP_SOURCE: "x-forwarded-for" })
      expect(from({ ...peer("10.0.0.2"), "x-forwarded-for": "6.6.6.6, 203.0.113.10" })).toBe(
        "203.0.113.10",
      )
    })

    test("TRUSTED_PROXY_HOPS counts proxies from the right", () => {
      use({ CLIENT_IP_SOURCE: "x-forwarded-for", TRUSTED_PROXY_HOPS: "2" })
      expect(from({ "x-forwarded-for": "6.6.6.6, 203.0.113.11, 10.0.0.3" })).toBe("203.0.113.11")
      // Fewer entries than proxies: the request skipped one, so only the peer is certain.
      expect(from({ ...peer("10.0.0.2"), "x-forwarded-for": "203.0.113.12" })).toBe("10.0.0.2")
    })

    test("TRUSTED_PROXIES skips trusted addresses from the right", () => {
      use({ CLIENT_IP_SOURCE: "x-forwarded-for", TRUSTED_PROXIES: "10.0.0.0/8, 2001:db8::/32" })
      expect(
        from({
          ...peer("10.0.0.2"),
          "x-forwarded-for": "6.6.6.6, 203.0.113.13, 2001:db8::9, 10.1.2.3",
        }),
      ).toBe("203.0.113.13")
    })

    test("TRUSTED_PROXIES ignores the header when the peer isn't a trusted proxy", () => {
      use({ CLIENT_IP_SOURCE: "x-forwarded-for", TRUSTED_PROXIES: "private" })
      expect(from({ ...peer("203.0.113.14"), "x-forwarded-for": "6.6.6.6" })).toBe("203.0.113.14")
      expect(from({ ...peer("172.18.0.5"), "x-forwarded-for": "6.6.6.6, 203.0.113.15" })).toBe(
        "203.0.113.15",
      )
    })
  })

  test("rejects settings it doesn't understand", () => {
    use({ CLIENT_IP_SOURCE: "cf-connecting-ip" })
    expect(() => clientIpConfig()).toThrow("CLIENT_IP_SOURCE")
    use({ CLIENT_IP_SOURCE: "x-forwarded-for", TRUSTED_PROXY_HOPS: "0" })
    expect(() => clientIpConfig()).toThrow("TRUSTED_PROXY_HOPS")
    use({ TRUSTED_PROXY_HOPS: "1", TRUSTED_PROXIES: "10.0.0.0/40" })
    expect(() => clientIpConfig()).toThrow("TRUSTED_PROXIES")
    use({ TRUSTED_PROXIES: "proxy.internal" })
    expect(() => clientIpConfig()).toThrow("TRUSTED_PROXIES")
  })

  describe("requests proxied by the share domain's site", () => {
    const proxied = (secret: string) => ({
      ...peer("192.0.2.50"),
      "x-sniptide-proxy-secret": secret,
      "x-sniptide-client-ip": "198.51.100.77",
    })

    test("use the visitor address the site passes along, with the right secret", () => {
      use({ SHARE_PROXY_SECRET: "s3cret-value", CLIENT_IP_SOURCE: "cloudflare" })
      expect(from(proxied("s3cret-value"))).toBe("198.51.100.77")
    })

    test("ignore it with a wrong secret, or when no secret is configured", () => {
      use({ SHARE_PROXY_SECRET: "s3cret-value" })
      expect(from(proxied("guess"))).toBe("192.0.2.50")
      expect(from(proxied("s3cret-valuf"))).toBe("192.0.2.50")

      delete process.env.SHARE_PROXY_SECRET
      expect(from(proxied(""))).toBe("192.0.2.50")
      expect(from(proxied("anything"))).toBe("192.0.2.50")
    })
  })
})

describe("withResolvedIp", () => {
  test("replaces a client-sent resolved address with the real one", () => {
    const headers = withResolvedIp(
      new Headers({ ...peer("203.0.113.20"), [RESOLVED_IP_HEADER]: "6.6.6.6" }),
    )
    expect(headers.get(RESOLVED_IP_HEADER)).toBe("203.0.113.20")
    expect(
      withResolvedIp(new Headers({ [RESOLVED_IP_HEADER]: "6.6.6.6" })).has(RESOLVED_IP_HEADER),
    ).toBe(false)
  })
})
