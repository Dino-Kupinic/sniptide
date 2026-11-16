import { expect, test } from "bun:test"
import { getConfig } from "@/lib/config"
import { bucket, installationId, reportSchema, sendInstanceReport } from "@/lib/instance-telemetry"

test("instance telemetry is off by default and validates the switch", () => {
  expect(getConfig({}).instanceTelemetry.enabled).toBe(false)
  expect(getConfig({ TELEMETRY: "off" }).instanceTelemetry.enabled).toBe(false)
  expect(() => getConfig({ TELEMETRY: "maybe" })).toThrow("TELEMETRY")
})

test("buckets counts without sending exact instance sizes", () => {
  expect([0, 1, 2, 10, 11, 100, 101, 1000, 1001].map(bucket)).toEqual([
    "0",
    "1",
    "2-10",
    "2-10",
    "11-100",
    "11-100",
    "101-1000",
    "101-1000",
    "1001+",
  ])
})

test("installation identity is stable, domain separated and resettable", () => {
  const config = getConfig({ BETTER_AUTH_SECRET: "a".repeat(32) })
  expect(installationId(config)).toBe(installationId(config))
  expect(installationId(config)).not.toContain("a".repeat(32))
  const id = crypto.randomUUID()
  expect(installationId(getConfig({ TELEMETRY_ID: id }))).toBe(id)
  expect(installationId(getConfig({ BETTER_AUTH_SECRET: "b".repeat(32) }))).not.toBe(
    installationId(config),
  )
})

test("off returns before collecting, claiming or sending anything", async () => {
  const fail = async () => {
    throw new Error("must not run")
  }
  expect(
    await sendInstanceReport(getConfig({ TELEMETRY: "off" }), {
      claim: fail,
      collect: fail,
      fetch: fail,
    }),
  ).toBe("completed")
})

test("unknown report properties and private strings are rejected", () => {
  expect(reportSchema.safeParse({ content: "private" }).success).toBe(false)
})

const example = {
  schema: 1 as const,
  installation: crypto.randomUUID(),
  release: "v0.95.3",
  deployment: "docker" as const,
  platform: "linux" as const,
  arch: "arm64" as const,
  node: 24,
  users: "2-10" as const,
  pastes: "11-100" as const,
  collections: "1" as const,
  apiRequestsYesterday: "0" as const,
  memoryMiB: "101-1000" as const,
  uptimeHours: "2-10" as const,
  features: {
    github: false,
    google: false,
    smtp: false,
    slack: false,
    discord: false,
    assistant: false,
  },
}
const enabled = getConfig({ TELEMETRY: "on", TELEMETRY_ID: example.installation })

test("enabled sends only a validated report to the fixed collector with bounded delivery", async () => {
  let sent = 0
  const outcome = await sendInstanceReport(enabled, {
    claim: async () => true,
    collect: async () => example,
    fetch: async (url, init) => {
      sent++
      expect(url).toBe("https://app.sniptide.com/api/instance-telemetry")
      expect(JSON.parse(String(init?.body))).toEqual(example)
      expect(init?.redirect).toBe("error")
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      return new Response(null, { status: 204 })
    },
  })
  expect(outcome).toBe("completed")
  expect(sent).toBe(1)
})

test("a claimed daily window skips both collection and delivery", async () => {
  const fail = async () => {
    throw new Error("must not run")
  }
  expect(
    await sendInstanceReport(enabled, { claim: async () => false, collect: fail, fetch: fail }),
  ).toBe("contended")
})

test("failed collection, transport and collector rejection return failed without throwing", async () => {
  for (const response of [
    async () => {
      throw new Error("network unavailable")
    },
    async () => new Response(null, { status: 503 }),
  ]) {
    expect(
      await sendInstanceReport(enabled, {
        claim: async () => true,
        collect: async () => example,
        fetch: response,
      }),
    ).toBe("failed")
  }
  let sent = false
  expect(
    await sendInstanceReport(enabled, {
      claim: async () => true,
      collect: async () => ({ ...example, content: "private" }),
      fetch: async () => {
        sent = true
        return new Response()
      },
    }),
  ).toBe("failed")
  expect(sent).toBe(false)
})

test("closed schema rejects unknown nested fields and identifying release strings", () => {
  expect(reportSchema.safeParse(example).success).toBe(true)
  expect(
    reportSchema.safeParse({
      ...example,
      features: { ...example.features, url: "https://private.example" },
    }).success,
  ).toBe(false)
  expect(reportSchema.safeParse({ ...example, release: "private.example" }).success).toBe(false)
  expect(reportSchema.safeParse({ ...example, users: 5 }).success).toBe(false)
  expect(() => getConfig({ TELEMETRY: "on" })).toThrow("TELEMETRY")
})
