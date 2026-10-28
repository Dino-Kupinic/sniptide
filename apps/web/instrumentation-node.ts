import path from "node:path"
import { migrateDb } from "@workspace/db/migrate"
import { getConfig } from "@/lib/config"
import { getDb } from "@/lib/db"

// Brings the Postgres database up to the latest migration, so a deploy never serves code that's
// ahead of its schema. In the Docker image the migrations are copied to MIGRATIONS_DIR; in the
// repo they sit in packages/db.
export async function migrateOnStartup() {
  // Reading the config here makes a bad setting stop the server at startup.
  const folder =
    getConfig().migrationsDir ?? path.join(process.cwd(), "../../packages/db/migrations")
  const report = await migrateDb(getDb(), folder)
  console.info(JSON.stringify({ event: "migrations", applied: report.applied }))
  // An older image started against a database a newer one migrated (a rollback, or a replica from
  // the previous release restarting mid-deploy). It runs, but its code predates the schema.
  if (report.ahead.length)
    console.warn(
      JSON.stringify({
        event: "migrations_ahead",
        ahead: report.ahead,
        message:
          "The database is newer than this version of Sniptide. Upgrade the image, or restore a backup taken before the newer version ran.",
      }),
    )
}

// Checks the client-IP settings, so a bad CLIENT_IP_SOURCE stops the server here, and starts
// recording each request's TCP peer for the "direct" source and the fallbacks.
export async function setUpClientIp() {
  const { installRequestAdmission } = await import("@/lib/request-admission")
  installRequestAdmission()
  const { startTelemetry } = await import("@/lib/telemetry")
  startTelemetry()
  const { clientIpConfig, recordPeerAddresses } = await import("@/lib/client-ip")
  clientIpConfig()
  recordPeerAddresses()
}

export async function startBackgroundJobs() {
  const { registerAdmissionPressure, runMaintenanceWork } = await import("@/lib/request-admission")
  const { drainVisits, scheduleVisitDrain, visitQueuePressure } = await import(
    "@/lib/pastes/visits"
  )
  registerAdmissionPressure("visits", visitQueuePressure)
  await runMaintenanceWork(async () => {
    await scheduleVisitDrain(async () => await runMaintenanceWork(() => drainVisits()))
    const { scheduleUsageReconciliation } = await import("@/lib/account/usage")
    scheduleUsageReconciliation()
    const { scheduleNotificationEmails } = await import("@/lib/notifications/email")
    scheduleNotificationEmails()
    const { schedulePurge } = await import("@/lib/pastes/purge")
    schedulePurge()
    const { scheduleRollup } = await import("@/lib/pastes/rollup")
    scheduleRollup()
    if (getConfig().demoMode) {
      const { scheduleDemoReset } = await import("@/lib/demo/reset")
      scheduleDemoReset()
    }
  })
}
