import { afterEach, describe, expect, test } from "bun:test"
import { feedbackEvent, posthogConfig } from "./feedback"

const saved = { key: process.env.POSTHOG_KEY, host: process.env.POSTHOG_HOST }

afterEach(() => {
  process.env.POSTHOG_KEY = saved.key
  process.env.POSTHOG_HOST = saved.host
  if (saved.key === undefined) delete process.env.POSTHOG_KEY
  if (saved.host === undefined) delete process.env.POSTHOG_HOST
})

describe("docs feedback", () => {
  test("sends nothing without a PostHog key", () => {
    delete process.env.POSTHOG_KEY
    expect(posthogConfig()).toBeNull()
  })

  test("uses the configured host without a trailing slash", () => {
    process.env.POSTHOG_KEY = "phc_test"
    process.env.POSTHOG_HOST = "https://eu.i.posthog.com/"
    expect(posthogConfig()).toEqual({ key: "phc_test", host: "https://eu.i.posthog.com" })
  })

  test("builds an anonymous event with the page and a score", () => {
    const event = feedbackEvent({ rating: "good", path: "/de/mcp", locale: "de" }, "phc_test", "id")
    expect(event.event).toBe("docs_feedback")
    expect(event.distinct_id).toBe("id")
    expect(event.properties).toMatchObject({
      path: "/de/mcp",
      locale: "de",
      rating: "good",
      score: 3,
      $process_person_profile: false,
    })
  })
})
