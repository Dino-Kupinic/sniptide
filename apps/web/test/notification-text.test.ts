import { describe, expect, test } from "bun:test"
import { describeNotification, viewMilestone } from "@/lib/notifications/describe"
import { senderLine } from "@/lib/notifications/email"

const HOUR = 3_600_000
const now = Date.UTC(2026, 9, 15, 12)

describe("view milestones", () => {
  test("are 10, 50, 100, 500 and so on", () => {
    const hits = [10, 50, 100, 500, 1000, 5000, 10_000, 50_000, 100_000]
    for (const views of hits) expect(viewMilestone(views)).toBe(true)
  })

  test("are nothing else", () => {
    const misses = [0, 1, 5, 9, 11, 15, 49, 51, 99, 101, 150, 501, 1001, 2000, 20_000]
    for (const views of misses) expect(viewMilestone(views)).toBe(false)
  })
})

describe("notification text", () => {
  const base = { count: null, title: "nginx proxy", slug: "nginx", expiresAt: null, actor: null }

  test("shared names who shared it and opens the paste", () => {
    const text = describeNotification({ ...base, kind: "shared", actor: "Dana" }, now)
    expect(text.title).toBe("Dana shared “nginx proxy” with you")
    expect(text.href).toBe("/pastes/nginx")
  })

  test("shared without a known sharer still reads naturally", () => {
    const text = describeNotification({ ...base, kind: "shared" }, now)
    expect(text.title).toBe("Someone shared “nginx proxy” with you")
  })

  test("burned opens the trash, where the paste is", () => {
    const text = describeNotification({ ...base, kind: "burned" }, now)
    expect(text.title).toBe("“nginx proxy” was read")
    expect(text.href).toBe("/trash")
  })

  test("expiring says when, from the paste as it is now", () => {
    const soon = describeNotification({ ...base, kind: "expiring", expiresAt: now + 5 * HOUR }, now)
    expect(soon.title).toBe("“nginx proxy” expires in 5 hours")
    const gone = describeNotification({ ...base, kind: "expiring", expiresAt: now - HOUR }, now)
    expect(gone.title).toBe("“nginx proxy” has expired")
    const kept = describeNotification({ ...base, kind: "expiring", expiresAt: null }, now)
    expect(kept.title).toBe("“nginx proxy” no longer expires")
    expect(soon.href).toBe("/pastes/nginx")
  })

  test("views opens the paste's analytics", () => {
    const text = describeNotification({ ...base, kind: "views", count: 1000, slug: "a b" }, now)
    expect(text.title).toBe("“nginx proxy” reached 1,000 views")
    expect(text.href).toBe("/analytics?paste=a%20b")
  })
})

describe("notification email sender line", () => {
  test("names the operator and a one-line postal address", () => {
    expect(senderLine({ name: "Example GmbH", address: "Ring 1\n 1010 Wien\nAustria" })).toBe(
      "\nSent by Example GmbH, Ring 1, 1010 Wien, Austria.\n",
    )
    expect(senderLine({ name: "Example GmbH" })).toBe("\nSent by Example GmbH.\n")
    expect(senderLine(undefined)).toBe("")
  })
})
