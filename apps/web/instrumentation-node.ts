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
  await migrateDb(getDb(), folder)
}

// Checks the client-IP settings, so a bad CLIENT_IP_SOURCE stops the server here, and starts
// recording each request's TCP peer for the "direct" source and the fallbacks.
export async function setUpClientIp() {
  const { startTelemetry } = await import("@/lib/telemetry")
  startTelemetry()
  const { clientIpConfig, recordPeerAddresses } = await import("@/lib/client-ip")
  clientIpConfig()
  recordPeerAddresses()
}

export async function startBackgroundJobs() {
  const { schedulePurge } = await import("@/lib/pastes/purge")
  schedulePurge()
}
