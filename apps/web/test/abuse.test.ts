import { beforeEach, describe, expect, test } from "bun:test"
import {
  inspectAbuseReport,
  listAbuseReports,
  resolveAbuseReport,
  submitAbuseReport,
} from "@workspace/db/abuse"
import { inspectModeration, transitionModeration } from "@workspace/db/moderation"
import { abuseReport, abuseReviewEvent, paste } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { POST } from "@/app/api/abuse/route"
import { abuseTarget } from "@/lib/abuse"
import { getDb } from "@/lib/db"
import { hasDatabase, resetDatabase, seedPaste, seedUser } from "./harness"

const describeDb = hasDatabase ? describe : describe.skip

test("abuse locations discard credentials in queries and fragments, reject other hosts and paths", () => {
  expect(
    abuseTarget("https://share.example/@alice/code?password=secret#key", ["https://share.example"]),
  ).toBe("@alice/code")
  for (const value of [
    "https://evil.example/paste",
    "https://user:password@share.example/paste",
    "https://share.example/paste/raw",
    "https://share.example/%2f%2fevil.example",
  ]) {
    expect(() => abuseTarget(value, ["https://share.example"])).toThrow()
  }
})
const report = {
  target: "synthetic-paste",
  category: "other" as const,
  explanation: "Synthetic report, no evidence attached.",
  contact: "",
}

describeDb("restricted abuse intake", () => {
  beforeEach(async () => {
    await getDb().delete(abuseReviewEvent)
    await getDb().delete(abuseReport)
    await resetDatabase()
  })

  test("deduplicates concurrent submissions without moderating the paste", async () => {
    await seedUser("owner")
    const target = await seedPaste({ slug: report.target, owner: "owner" })
    const results = await Promise.all(
      Array.from({ length: 6 }, () => submitAbuseReport(getDb(), report, "a".repeat(64))),
    )
    expect(new Set(results.map((result) => result.id)).size).toBe(1)
    expect(await getDb().select().from(abuseReport)).toHaveLength(1)
    const [row] = await getDb().select().from(paste).where(eq(paste.id, target.id))
    expect(row?.moderationState).toBe("allowed")
  })

  test("prioritizes urgent allegations and keeps explanations out of the queue", async () => {
    await submitAbuseReport(getDb(), report, "a".repeat(64))
    await submitAbuseReport(getDb(), { ...report, category: "child_exploitation" }, "b".repeat(64))
    const queue = await listAbuseReports(getDb(), "operator@host")
    expect(queue[0]?.category).toBe("child_exploitation")
    expect(JSON.stringify(queue)).not.toContain(report.explanation)
    expect(await getDb().select().from(abuseReviewEvent)).toHaveLength(1)
  })

  test("audits explicit detail access and resolution without copying report text", async () => {
    const created = await submitAbuseReport(getDb(), report, "a".repeat(64))
    expect((await inspectAbuseReport(getDb(), created.id, "operator@host"))?.explanation).toBe(
      report.explanation,
    )
    await resolveAbuseReport(getDb(), { id: created.id, outcome: "no_action" }, "operator@host")
    expect(await listAbuseReports(getDb(), "operator@host")).toHaveLength(0)
    const events = await getDb().select().from(abuseReviewEvent)
    expect(events.map((event) => event.operation)).toEqual(["inspect", "resolve", "list"])
    expect(JSON.stringify(events)).not.toContain(report.explanation)
  })

  test("accepts appeals and nonexistent locations without exposing paste existence", async () => {
    const created = await submitAbuseReport(
      getDb(),
      { ...report, category: "appeal" },
      "a".repeat(64),
    )
    expect(Object.keys(created)).toEqual(["id"])
    expect((await inspectAbuseReport(getDb(), created.id, "operator@host"))?.category).toBe(
      "appeal",
    )
    await expect(
      resolveAbuseReport(
        getDb(),
        { id: created.id, outcome: "removed", decisionCommandId: crypto.randomUUID() },
        "operator@host",
      ),
    ).rejects.toThrow()
    expect(await listAbuseReports(getDb(), "operator@host")).toHaveLength(1)
  })

  test("ties a report resolution to an audited decision for its immutable paste", async () => {
    await seedUser("owner")
    const target = await seedPaste({ slug: report.target, owner: "owner" })
    const created = await submitAbuseReport(getDb(), report, "a".repeat(64))
    const current = await inspectModeration(getDb(), target.id)
    if (!current) throw new Error("Missing fixture")
    const commandId = crypto.randomUUID()
    await transitionModeration(
      getDb(),
      {
        commandId,
        pasteId: target.id,
        expectedContentVersion: current.contentVersion,
        expectedModerationVersion: current.moderationVersion,
        state: "quarantined",
        reasonCode: "review",
        caseReference: created.id,
      },
      "operator@host",
    )
    expect(
      await resolveAbuseReport(
        getDb(),
        { id: created.id, outcome: "quarantined", decisionCommandId: commandId },
        "operator@host",
      ),
    ).toEqual({ id: created.id, outcome: "quarantined" })
    await expect(
      resolveAbuseReport(getDb(), { id: created.id, outcome: "no_action" }, "operator@host"),
    ).rejects.toThrow()
  })

  test("public intake requires activation and same-origin forms; enforces limits without revealing existence", async () => {
    const saved = {
      ABUSE_REPORTS_ENABLED: process.env.ABUSE_REPORTS_ENABLED,
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    }
    const send = (origin = "https://app.example", extra: Record<string, string> = {}) =>
      POST(
        new Request("https://app.example/api/abuse", {
          method: "POST",
          headers: { origin },
          body: new URLSearchParams({
            url: "https://app.example/missing-paste?token=secret#key",
            category: "other",
            explanation: report.explanation,
            contact: "",
            ...extra,
          }),
        }),
      )
    try {
      process.env.ABUSE_REPORTS_ENABLED = "false"
      expect((await send()).status).toBe(404)
      process.env.ABUSE_REPORTS_ENABLED = "true"
      process.env.BETTER_AUTH_URL = "https://app.example"
      process.env.BETTER_AUTH_SECRET = "synthetic-test-secret-at-least-32-characters"
      expect((await send("https://evil.example")).status).toBe(403)
      const response = await send()
      expect(response.headers.get("location")).toBe("https://app.example/abuse?status=received")
      expect(response.headers.get("cache-control")).toContain("no-store")
      expect(await response.text()).toBe("")
      expect(
        (await send("https://app.example", { attachment: "not allowed" })).headers.get("location"),
      ).toContain("invalid")
      expect((await send("https://app.example", { explanation: "x".repeat(13000) })).status).toBe(
        413,
      )
      for (let attempt = 0; attempt < 7; attempt++) await send()
      const limited = await send()
      expect(limited.headers.get("retry-after")).toBeDefined()
      const [stored] = await getDb().select().from(abuseReport)
      expect(stored?.target).toBe("missing-paste")
      expect(JSON.stringify(stored)).not.toContain("secret")
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })
})
