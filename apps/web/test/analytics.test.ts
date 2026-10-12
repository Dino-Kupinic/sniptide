import { afterEach, describe, expect, test } from "bun:test"
import { readAuthMarker, scrubPath, scrubUrl, withAuthMarker } from "@/lib/analytics"
import { assetsHost, forwardToPostHog, uiHost, upstreamUrl } from "@/lib/analytics-proxy"
import { getConfig } from "@/lib/config"

// PostHog: events must never carry slugs or query strings, and the proxy only runs with a key.

describe("scrubPath", () => {
  test("replaces share-link slugs", () => {
    expect(scrubPath("/k7Qe2x")).toBe("/[slug]")
    expect(scrubPath("/k7Qe2x/raw")).toBe("/[slug]/raw")
    expect(scrubPath("/my-custom-link/reveal")).toBe("/[slug]/reveal")
  })

  test("replaces slugs inside app sections", () => {
    expect(scrubPath("/pastes/k7Qe2x")).toBe("/pastes/[slug]")
    expect(scrubPath("/pastes/k7Qe2x/edit")).toBe("/pastes/[slug]/edit")
    expect(scrubPath("/collections/work")).toBe("/collections/[slug]")
  })

  test("keeps app pages", () => {
    for (const path of ["/", "/dashboard", "/new", "/sign-up", "/settings", "/pastes"]) {
      expect(scrubPath(path)).toBe(path)
    }
  })
})

describe("scrubUrl", () => {
  test("drops slugs, queries and fragments", () => {
    expect(scrubUrl("https://sniptide.com/k7Qe2x/raw?file=secrets.env#L3")).toBe(
      "https://sniptide.com/[slug]/raw",
    )
    expect(scrubUrl("https://app.sniptide.com/pastes?q=password")).toBe(
      "https://app.sniptide.com/pastes",
    )
  })

  test("handles bare paths", () => {
    expect(scrubUrl("/pastes/k7Qe2x?tab=views")).toBe("/pastes/[slug]")
  })
})

describe("PostHog hosts", () => {
  test("maps the region to its assets and app hosts", () => {
    expect(assetsHost("https://us.i.posthog.com")).toBe("https://us-assets.i.posthog.com")
    expect(assetsHost("https://eu.i.posthog.com")).toBe("https://eu-assets.i.posthog.com")
    expect(uiHost("https://eu.i.posthog.com")).toBe("https://eu.posthog.com")
  })

  test("sends static files to the assets host", () => {
    const host = "https://us.i.posthog.com"
    expect(upstreamUrl(host, ["static", "array.js"], "")).toBe(
      "https://us-assets.i.posthog.com/static/array.js",
    )
    expect(upstreamUrl(host, ["i", "v0", "e"], "?ver=1")).toBe(
      "https://us.i.posthog.com/i/v0/e?ver=1",
    )
  })
})

describe("config", () => {
  test("analytics are off without a key", () => {
    expect(getConfig({}).analytics).toBeUndefined()
    expect(getConfig({ POSTHOG_KEY: "  " }).analytics).toBeUndefined()
  })

  test("defaults to the US region", () => {
    expect(getConfig({ POSTHOG_KEY: "phc_x" }).analytics).toEqual({
      key: "phc_x",
      host: "https://us.i.posthog.com",
    })
    expect(
      getConfig({ POSTHOG_KEY: "phc_x", POSTHOG_HOST: "https://eu.i.posthog.com/" }).analytics
        ?.host,
    ).toBe("https://eu.i.posthog.com")
  })
})

describe("forwardToPostHog", () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
    delete process.env.POSTHOG_KEY
  })

  test("is a 404 without a key", async () => {
    const response = await forwardToPostHog(new Request("https://app.test/api/analytics/e"), ["e"])
    expect(response.status).toBe(404)
  })

  test("forwards without cookies", async () => {
    process.env.POSTHOG_KEY = "phc_x"
    const calls: { url: string; headers: Headers }[] = []
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, headers: new Headers(init.headers) })
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } })
    }) as typeof fetch

    const response = await forwardToPostHog(
      new Request("https://app.test/api/analytics/flags?v=2", {
        method: "POST",
        headers: { cookie: "session=1", authorization: "Bearer x", "content-type": "text/plain" },
        body: "{}",
      }),
      ["flags"],
    )
    expect(response.status).toBe(200)
    expect(calls[0]?.url).toBe("https://us.i.posthog.com/flags?v=2")
    expect(calls[0]?.headers.get("cookie")).toBeNull()
    expect(calls[0]?.headers.get("authorization")).toBeNull()
    expect(calls[0]?.headers.get("content-type")).toBe("text/plain")
  })
})

describe("auth marker", () => {
  test("adds the event and method to the return path", () => {
    expect(withAuthMarker("/dashboard", "signed_up", "github")).toBe(
      "/dashboard?auth=signed_up&method=github",
    )
    expect(withAuthMarker("/dashboard?tab=1", "signed_in", "google")).toBe(
      "/dashboard?tab=1&auth=signed_in&method=google",
    )
  })

  test("reads the marker and returns the URL without it", () => {
    const marker = readAuthMarker(
      "https://app.sniptide.com/dashboard?tab=1&auth=signed_up&method=github#top",
    )
    expect(marker).toEqual({
      event: "signed_up",
      method: "github",
      cleanUrl: "/dashboard?tab=1#top",
    })
  })

  test("ignores a missing or unknown marker", () => {
    expect(readAuthMarker("https://app.sniptide.com/dashboard")).toBeNull()
    expect(
      readAuthMarker("https://app.sniptide.com/dashboard?auth=paste_created&method=github"),
    ).toBeNull()
    expect(
      readAuthMarker("https://app.sniptide.com/dashboard?auth=signed_up&method=a@b.c"),
    ).toBeNull()
  })
})
