import { afterEach, describe, expect, test } from "bun:test"
import { clientAddress } from "@/lib/client-ip"

// The address the rate limits key on: the one the proxies in front of the app vouch for, never
// one the client can choose.

const env = { ...process.env }
afterEach(() => {
  process.env = { ...env }
})

const from = (headers: Record<string, string>) => clientAddress(new Headers(headers))

describe("clientAddress", () => {
  test("Cloudflare's CF-Connecting-IP wins over X-Forwarded-For by default", () => {
    delete process.env.CLIENT_IP_HEADER
    expect(
      from({ "cf-connecting-ip": "198.51.100.4", "x-forwarded-for": "1.1.1.1, 172.70.0.1" }),
    ).toBe("198.51.100.4")
  })

  test("without that header it falls back to the last hop in X-Forwarded-For", () => {
    delete process.env.CLIENT_IP_HEADER
    expect(from({ "x-forwarded-for": "spoofed, 203.0.113.7" })).toBe("203.0.113.7")
    expect(from({ "x-real-ip": "203.0.113.8" })).toBe("203.0.113.8")
    expect(from({})).toBe("unknown")
  })

  test("CLIENT_IP_HEADER picks the header to trust", () => {
    process.env.CLIENT_IP_HEADER = "X-Real-IP"
    expect(from({ "x-real-ip": "203.0.113.9", "cf-connecting-ip": "6.6.6.6" })).toBe("203.0.113.9")

    process.env.CLIENT_IP_HEADER = "x-forwarded-for"
    expect(
      from({ "cf-connecting-ip": "6.6.6.6", "x-forwarded-for": "6.6.6.6, 203.0.113.10" }),
    ).toBe("203.0.113.10")
  })

  describe("requests proxied by the share domain's site", () => {
    const proxied = (secret: string) => ({
      "cf-connecting-ip": "192.0.2.50",
      "x-sniptide-proxy-secret": secret,
      "x-sniptide-client-ip": "198.51.100.77",
    })

    test("use the visitor address the site passes along, with the right secret", () => {
      process.env.SHARE_PROXY_SECRET = "s3cret-value"
      expect(from(proxied("s3cret-value"))).toBe("198.51.100.77")
    })

    test("ignore it with a wrong secret, or when no secret is configured", () => {
      process.env.SHARE_PROXY_SECRET = "s3cret-value"
      expect(from(proxied("guess"))).toBe("192.0.2.50")
      expect(from(proxied("s3cret-valuf"))).toBe("192.0.2.50")

      delete process.env.SHARE_PROXY_SECRET
      expect(from(proxied(""))).toBe("192.0.2.50")
      expect(from(proxied("anything"))).toBe("192.0.2.50")
    })
  })
})
