import { describe, expect, test } from "bun:test"
import { countryOf, deviceOf, isAutomated, isHumanVisit, referrerHost } from "@/lib/pastes/hit"

// What the analytics events keep of a request: nothing from machines, and only coarse facts from
// people.

const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"

const headers = (init: Record<string, string>) => new Headers(init)
const withAgent = (agent: string, extra: Record<string, string> = {}) =>
  headers({ "user-agent": agent, ...extra })

describe("automated requests", () => {
  test("a browser is not automated", () => {
    expect(isAutomated(withAgent(CHROME))).toBe(false)
    expect(isAutomated(withAgent(IPHONE))).toBe(false)
  })

  test("crawlers and link unfurlers are", () => {
    for (const agent of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
      "Twitterbot/1.0",
      "facebookexternalhit/1.1",
    ]) {
      expect(isAutomated(withAgent(agent))).toBe(true)
    }
  })

  test("headless browsers and uptime checks are", () => {
    expect(isAutomated(withAgent(CHROME.replace("Chrome", "HeadlessChrome")))).toBe(true)
    expect(isAutomated(withAgent("Mozilla/5.0 (compatible; UptimeRobot/2.0)"))).toBe(true)
    expect(isAutomated(withAgent("Chrome-Lighthouse"))).toBe(true)
  })

  test("a missing user agent is", () => {
    expect(isAutomated(headers({}))).toBe(true)
    expect(isAutomated(headers({ "user-agent": "  " }))).toBe(true)
  })

  test("prefetches are, however they announce themselves", () => {
    expect(isAutomated(withAgent(CHROME, { purpose: "prefetch" }))).toBe(true)
    expect(isAutomated(withAgent(CHROME, { "sec-purpose": "prefetch;prerender" }))).toBe(true)
    expect(isAutomated(withAgent(CHROME, { "next-router-prefetch": "1" }))).toBe(true)
    expect(isAutomated(withAgent(CHROME, { "x-moz": "prefetch" }))).toBe(true)
  })

  test("curl is not a crawler", () => {
    expect(isAutomated(withAgent("curl/8.4.0"))).toBe(false)
  })
})

describe("devices", () => {
  test("phones and tablets are mobile, other browsers desktop", () => {
    expect(deviceOf(withAgent(IPHONE))).toBe("mobile")
    expect(deviceOf(withAgent(CHROME))).toBe("desktop")
    expect(
      deviceOf(withAgent("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15")),
    ).toBe("mobile")
  })

  test("command-line tools and HTTP libraries are cli", () => {
    for (const agent of [
      "curl/8.4.0",
      "Wget/1.21.4",
      "HTTPie/3.2.2",
      "python-requests/2.31.0",
      "Go-http-client/2.0",
      "node-fetch/1.0",
      "PostmanRuntime/7.36.0",
    ]) {
      expect(deviceOf(withAgent(agent))).toBe("cli")
    }
  })
})

describe("what counts as a view", () => {
  test("a person in a browser does; a script or a bot does not", () => {
    expect(isHumanVisit(withAgent(CHROME))).toBe(true)
    expect(isHumanVisit(withAgent(IPHONE))).toBe(true)
    expect(isHumanVisit(withAgent("curl/8.4.0"))).toBe(false)
    expect(isHumanVisit(withAgent("Googlebot/2.1"))).toBe(false)
    expect(isHumanVisit(headers({}))).toBe(false)
  })
})

describe("referrer hosts", () => {
  const own = ["sniptide.com", "localhost:3000"]

  test("keeps only the host", () => {
    expect(referrerHost("https://news.ycombinator.com/item?id=1&token=abc#x", own)).toBe(
      "news.ycombinator.com",
    )
    expect(referrerHost("https://github.com/Dino-Kupinic/sniptide/issues/1", own)).toBe(
      "github.com",
    )
  })

  test("drops www, case, a trailing dot and the port", () => {
    expect(referrerHost("https://WWW.Example.COM.:8443/a", own)).toBe("example.com")
  })

  test("is null for a direct visit and for the app's own pages", () => {
    expect(referrerHost(null, own)).toBeNull()
    expect(referrerHost("", own)).toBeNull()
    expect(referrerHost("https://sniptide.com/dashboard", own)).toBeNull()
    expect(referrerHost("https://www.sniptide.com/", own)).toBeNull()
    expect(referrerHost("http://localhost:3000/pastes", own)).toBeNull()
  })

  test("is null for what isn't a website", () => {
    expect(referrerHost("android-app://com.google.android.gm/", own)).toBeNull()
    expect(referrerHost("not a url", own)).toBeNull()
    expect(referrerHost("https://192.168.1.20/admin", own)).toBeNull()
    expect(referrerHost("http://[::1]:8080/", own)).toBeNull()
    expect(referrerHost("http://intranet/wiki", own)).toBeNull()
  })
})

describe("country", () => {
  test("reads the CDN's header", () => {
    expect(countryOf(headers({ "cf-ipcountry": "at" }))).toBe("AT")
    expect(countryOf(headers({ "x-vercel-ip-country": "DE" }))).toBe("DE")
    expect(countryOf(headers({ "cloudfront-viewer-country": "US" }))).toBe("US")
  })

  test("is null without one, or when the CDN doesn't know", () => {
    expect(countryOf(headers({}))).toBeNull()
    expect(countryOf(headers({ "cf-ipcountry": "XX" }))).toBeNull()
    expect(countryOf(headers({ "cf-ipcountry": "Austria" }))).toBeNull()
    expect(countryOf(headers({ "cf-ipcountry": "" }))).toBeNull()
  })
})
