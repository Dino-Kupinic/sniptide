import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { accountUsage, apiTokenUsageDay, rateLimit } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { POST } from "@/app/api/instance-telemetry/route"
import { getConfig } from "@/lib/config"
import { getDb } from "@/lib/db"
import { sendInstanceReport } from "@/lib/instance-telemetry"
import { hasDatabase, resetDatabase, seedUser } from "./harness"

const originalFetch = globalThis.fetch
const saved = { ...process.env }
const describeDb = hasDatabase ? describe : describe.skip
let sent: { url: string; init?: RequestInit }[] = []
function request(body: unknown) {
  return POST(
    new Request("https://app.sniptide.com/api/instance-telemetry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  )
}

describeDb("instance reporting and collection", () => {
  beforeEach(async () => {
    await resetDatabase()
    sent = []
    globalThis.fetch = (async (url, init) => {
      sent.push({ url: String(url), init })
      return new Response(null, { status: 204 })
    }) as typeof fetch
    delete process.env.TELEMETRY
    process.env.BETTER_AUTH_SECRET = "test-secret-".repeat(4)
    process.env.BETTER_AUTH_URL = "https://private.example"
    process.env.DEPLOYMENT_VERSION = "private-release-label"
    process.env.POSTHOG_KEY = "phc_test"
  })
  afterEach(async () => {
    globalThis.fetch = originalFetch
    for (const name of [
      "TELEMETRY",
      "BETTER_AUTH_SECRET",
      "BETTER_AUTH_URL",
      "DEPLOYMENT_VERSION",
      "POSTHOG_KEY",
    ]) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }
    await resetDatabase()
  })

  test("collects bucketed totals and makes one attempt across concurrent replicas and restart calls", async () => {
    await seedUser("telemetry-user")
    await getDb()
      .update(accountUsage)
      .set({ pasteCount: 15, collectionCount: 3 })
      .where(eq(accountUsage.ownerId, "telemetry-user"))
    await getDb()
      .insert(apiTokenUsageDay)
      .values({
        ownerId: "telemetry-user",
        tokenId: crypto.randomUUID(),
        day: Math.floor(Date.now() / 86400000) - 1,
        requests: 50,
      })
    delete process.env.POSTHOG_KEY
    const config = getConfig()
    expect(config.instanceTelemetry.enabled).toBe(true)
    expect(config.analytics).toBeUndefined()
    const results = await Promise.all(Array.from({ length: 5 }, () => sendInstanceReport(config)))
    expect(results.filter((r) => r === "completed")).toHaveLength(1)
    expect(await sendInstanceReport(config)).toBe("contended")
    expect(sent).toHaveLength(1)
    const report = JSON.parse(String(sent[0]?.init?.body))
    expect(report).toMatchObject({
      users: "1",
      pastes: "11-100",
      collections: "2-10",
      apiRequestsYesterday: "11-100",
      release: "unknown",
    })
    expect(JSON.stringify(report)).not.toContain("private")
    await getDb()
      .update(rateLimit)
      .set({ windowStart: new Date(Date.now() - 86401000) })
      .where(eq(rateLimit.key, "instance-telemetry:send"))
    expect(await sendInstanceReport(config)).toBe("completed")
    expect(sent).toHaveLength(2)
  })

  test("collector validates bodies and forwards no source headers or IP", async () => {
    expect((await request({})).status).toBe(404)
    await sendInstanceReport(getConfig())
    const report = JSON.parse(String(sent[0]?.init?.body))
    sent = []
    process.env.BETTER_AUTH_URL = "https://app.sniptide.com"
    expect((await request({ ...report, url: "private.example" })).status).toBe(400)
    expect(
      (await request({ ...report, features: { ...report.features, private: true } })).status,
    ).toBe(400)
    expect((await request({ padding: "x".repeat(4096) })).status).toBe(413)
    expect(
      (
        await POST(
          new Request("https://app.sniptide.com/api/instance-telemetry", {
            method: "POST",
            body: "bad json",
          }),
        )
      ).status,
    ).toBe(400)
    expect((await request(report)).status).toBe(204)
    expect(sent).toHaveLength(1)
    const event = JSON.parse(String(sent[0]?.init?.body))
    expect(event).toMatchObject({
      event: "self_hosted_instance_report",
      distinct_id: report.installation,
      properties: { $ip: "0.0.0.0", $geoip_disable: true, $process_person_profile: false },
    })
    expect(event.properties.installation).toBeUndefined()
    expect(sent[0]?.init?.headers).toEqual({ "content-type": "application/json" })
  })

  test("collector is disabled without PostHog and limits anonymous submissions", async () => {
    process.env.BETTER_AUTH_URL = "https://app.sniptide.com"
    delete process.env.POSTHOG_KEY
    expect((await request({})).status).toBe(404)
    process.env.POSTHOG_KEY = "phc_test"
    for (let i = 0; i < 60; i++) expect((await request({})).status).toBe(400)
    expect((await request({})).status).toBe(429)
    expect(sent).toHaveLength(0)
  })
})
