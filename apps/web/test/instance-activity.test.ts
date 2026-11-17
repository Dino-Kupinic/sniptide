import { expect, test } from "bun:test"
import { getConfig } from "@/lib/config"
import { recordAccountActivity } from "@/lib/instance-activity"
import { reportSchema } from "@/lib/instance-telemetry"

test("disabled activity collection never touches the database", async () => {
  const before = process.env.TELEMETRY
  process.env.TELEMETRY = "off"
  try {
    await recordAccountActivity({} as never, "local-account", "creates", "web")
    expect(getConfig().instanceTelemetry.enabled).toBe(false)
  } finally {
    if (before === undefined) delete process.env.TELEMETRY
    else process.env.TELEMETRY = before
  }
})

test("schema 2 requires exact bounded aggregate counts and rejects account identifiers", () => {
  const report = {
    schema: 2,
    installation: crypto.randomUUID(),
    release: "v1.0.0",
    deployment: "docker",
    platform: "linux",
    arch: "arm64",
    node: 24,
    users: "2-10",
    pastes: "2-10",
    collections: "1",
    apiRequestsYesterday: "0",
    memoryMiB: "101-1000",
    uptimeHours: "2-10",
    features: {
      github: false,
      google: false,
      smtp: false,
      slack: false,
      discord: false,
      assistant: false,
    },
    reportDay: 20000,
    activitySinceDay: 19900,
    activationDay: 19905,
    totalAccounts: 4,
    activeAccounts1d: 1,
    activeAccounts7d: 2,
    activeAccounts30d: 3,
    creates7d: 2,
    edits7d: 1,
    reads7d: 3,
    workflow7d: { web: 3, api: 1, cli: 1, mcp: 1 },
  }
  expect(reportSchema.safeParse(report).success).toBe(true)
  expect(reportSchema.safeParse({ ...report, totalAccounts: -1 }).success).toBe(false)
  expect(reportSchema.safeParse({ ...report, activeAccounts7d: "2-10" }).success).toBe(false)
  expect(reportSchema.safeParse({ ...report, accountIds: ["local-only"] }).success).toBe(false)
})
