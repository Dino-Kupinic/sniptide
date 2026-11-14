import { expect, test } from "bun:test"
import { relativeTime } from "../src/lib/time"

const now = Date.parse("2026-11-13T12:00:00Z")

test("picks the largest unit that fits", () => {
  expect(relativeTime("2026-11-13T11:59:50Z", now, "en")).toBe("now")
  expect(relativeTime("2026-11-13T11:15:00Z", now, "en")).toBe("45 minutes ago")
  expect(relativeTime("2026-11-13T09:00:00Z", now, "en")).toBe("3 hours ago")
  expect(relativeTime("2026-11-12T10:00:00Z", now, "en")).toBe("yesterday")
  expect(relativeTime("2026-10-01T12:00:00Z", now, "en")).toBe("last month")
  expect(relativeTime("2024-11-01T12:00:00Z", now, "en")).toBe("2 years ago")
})
