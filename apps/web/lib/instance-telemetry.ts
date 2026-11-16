import "server-only"

import { createHmac } from "node:crypto"
import { accountUsage, apiTokenUsageDay, user } from "@workspace/db/schema"
import { count, eq, sql } from "drizzle-orm"
import { z } from "zod"
import type { Config } from "@/lib/config"
import { getDb } from "@/lib/db"
import type { JobOutcome } from "@/lib/jobs/runner"
import { hit } from "@/lib/rate-limit"
import { deploymentVersion } from "@/lib/support/server"
import { seconds } from "@/lib/time"

const buckets = ["0", "1", "2-10", "11-100", "101-1000", "1001+"] as const
const size = z.enum(buckets)
export function bucket(value: number): (typeof buckets)[number] {
  return value <= 0
    ? "0"
    : value <= 1
      ? "1"
      : value <= 10
        ? "2-10"
        : value <= 100
          ? "11-100"
          : value <= 1000
            ? "101-1000"
            : "1001+"
}

// A closed payload prevents custom release labels and unexpected properties becoming data channels.
export const reportSchema = z.strictObject({
  schema: z.literal(1),
  installation: z.union([z.uuid(), z.string().regex(/^[a-f0-9]{64}$/)]),
  release: z.string().regex(/^(?:v?\d+\.\d+\.\d+|[a-f0-9]{7,40}|unknown)$/),
  deployment: z.enum(["docker", "coolify", "other"]),
  platform: z.enum(["linux", "darwin", "win32", "other"]),
  arch: z.enum(["x64", "arm64", "other"]),
  node: z.number().int().min(20).max(100),
  users: size,
  pastes: size,
  collections: size,
  apiRequestsYesterday: size,
  memoryMiB: size,
  uptimeHours: size,
  features: z.strictObject({
    github: z.boolean(),
    google: z.boolean(),
    smtp: z.boolean(),
    slack: z.boolean(),
    discord: z.boolean(),
    assistant: z.boolean(),
  }),
})
type Report = z.infer<typeof reportSchema>

export function installationId(config: Config) {
  if (config.instanceTelemetry.id) return config.instanceTelemetry.id
  if (!config.authSecret) throw new Error("An installation identity needs the auth secret.")
  return createHmac("sha256", config.authSecret)
    .update("sniptide:instance-telemetry:v1")
    .digest("hex")
}

async function collect(config: Config): Promise<Report> {
  const db = getDb()
  const [users] = await db.select({ value: count() }).from(user)
  const [totals] = await db
    .select({
      pastes: sql<number>`coalesce(sum(${accountUsage.pasteCount}), 0)::float8`,
      collections: sql<number>`coalesce(sum(${accountUsage.collectionCount}), 0)::float8`,
    })
    .from(accountUsage)
  const [requests] = await db
    .select({ value: sql<number>`coalesce(sum(${apiTokenUsageDay.requests}), 0)::float8` })
    .from(apiTokenUsageDay)
    .where(eq(apiTokenUsageDay.day, Math.floor(Date.now() / 86400000) - 1))
  const version = deploymentVersion()
  return reportSchema.parse({
    schema: 1,
    installation: installationId(config),
    release: /^(?:v?\d+\.\d+\.\d+|[a-f0-9]{7,40})$/.test(version) ? version : "unknown",
    deployment: config.instanceTelemetry.deployment,
    platform: ["linux", "darwin", "win32"].includes(process.platform) ? process.platform : "other",
    arch: ["x64", "arm64"].includes(process.arch) ? process.arch : "other",
    node: Number(process.versions.node.split(".")[0]),
    users: bucket(users?.value ?? 0),
    pastes: bucket(totals?.pastes ?? 0),
    collections: bucket(totals?.collections ?? 0),
    apiRequestsYesterday: bucket(requests?.value ?? 0),
    memoryMiB: bucket(process.memoryUsage().rss / 1024 ** 2),
    uptimeHours: bucket(process.uptime() / 3600),
    features: {
      github: Boolean(config.github),
      google: Boolean(config.google),
      smtp: Boolean(config.smtp),
      slack: Boolean(config.webhooks.slack),
      discord: Boolean(config.webhooks.discord),
      assistant: Boolean(config.support.assistant),
    },
  })
}

const defaults = {
  // Shared counter holds across replicas and restarts. A failed attempt waits until the next day.
  claim: async () =>
    (await hit([{ key: "instance-telemetry:send", max: 1, windowSeconds: seconds(86400) }]))
      .allowed,
  collect,
  fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
}

export async function sendInstanceReport(config: Config, deps = defaults): Promise<JobOutcome> {
  if (!config.instanceTelemetry.enabled) return "completed"
  // Configuration-only tools and unconfigured development servers have no installation identity.
  if (!config.authSecret && !config.instanceTelemetry.id) return "completed"
  try {
    if (!(await deps.claim())) return "contended"
    const report = reportSchema.parse(await deps.collect(config))
    const response = await deps.fetch("https://app.sniptide.com/api/instance-telemetry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(3000),
      redirect: "error",
    })
    return response.ok ? "completed" : "failed"
  } catch {
    // Payloads and transport errors can contain operator data; expose only the job outcome.
    return "failed"
  }
}
