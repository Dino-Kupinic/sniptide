import "server-only"

import { reconcileUsageBatch } from "@/lib/account/usage"
import { getConfig } from "@/lib/config"
import { deliverNotificationEmails } from "@/lib/notifications/email"
import { notifyExpiringPastes } from "@/lib/notifications/expiring"
import { purgeStaleData } from "@/lib/pastes/purge"
import { rollUpAnalytics } from "@/lib/pastes/rollup"
import { runMaintenanceWork } from "@/lib/request-admission"
import { HOUR, MINUTE } from "@/lib/time"
import { createJobRunner, type JobOutcome } from "./jobs/runner"

const definitions = {
  purge: {
    intervalMs: HOUR,
    run: () =>
      runMaintenanceWork(async (): Promise<JobOutcome> => {
        let purged: Awaited<ReturnType<typeof purgeStaleData>> = null
        let failed = false
        try {
          purged = await purgeStaleData()
        } catch {
          failed = true
        }
        try {
          await notifyExpiringPastes()
        } catch {
          failed = true
        }
        return failed ? "failed" : purged === null ? "contended" : "completed"
      }),
  },
  analytics: {
    intervalMs: 15 * MINUTE,
    run: () =>
      runMaintenanceWork(
        async (): Promise<JobOutcome> =>
          (await rollUpAnalytics()) === null ? "contended" : "completed",
      ),
  },
  usage: {
    intervalMs: MINUTE,
    run: () =>
      runMaintenanceWork(async (): Promise<JobOutcome> => {
        await reconcileUsageBatch()
        return "completed"
      }),
  },
  email: {
    intervalMs: MINUTE,
    enabled: () => Boolean(getConfig().smtp && getConfig().appUrl),
    run: () =>
      runMaintenanceWork(async (): Promise<JobOutcome> => {
        const totals = await deliverNotificationEmails()
        return totals.retried || totals.failed ? "failed" : "completed"
      }),
  },
}

export type JobName = keyof typeof definitions
const state = globalThis as typeof globalThis & { __sniptideJobRunner?: ReturnType<typeof runner> }
function runner() {
  return createJobRunner(definitions, {
    report: (report) => console.info(JSON.stringify({ event: "maintenance_job", ...report })),
  })
}
function jobs() {
  state.__sniptideJobRunner ??= runner()
  return state.__sniptideJobRunner
}

export function isJobName(name: string): name is JobName {
  return Object.hasOwn(definitions, name)
}
export function runJob(name: JobName) {
  return jobs().run(name)
}
export function jobStatus() {
  return { scope: "process", resetsOnRestart: true, jobs: jobs().snapshot() }
}
export function scheduleMaintenanceJobs() {
  jobs().start()
}
export function stopMaintenanceJobs() {
  return jobs().stop()
}
