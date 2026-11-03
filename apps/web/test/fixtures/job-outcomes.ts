import { mock } from "bun:test"

const mode = process.argv[2]
let notifications = 0
let release: () => void = () => {}
const gate = new Promise<void>((resolve) => {
  release = resolve
})
mock.module("server-only", () => ({}))
mock.module("@/lib/config", () => ({
  getConfig: () => ({ smtp: mode === "email-disabled" ? null : {}, appUrl: "http://localhost" }),
}))
mock.module("@/lib/account/usage", () => ({ reconcileUsageBatch: async () => 0 }))
mock.module("@/lib/notifications/email", () => ({
  deliverNotificationEmails: async () => ({ sent: 0, skipped: 0, retried: 1, failed: 0 }),
}))
mock.module("@/lib/notifications/expiring", () => ({
  notifyExpiringPastes: async () => {
    notifications++
  },
}))
mock.module("@/lib/pastes/purge", () => ({
  purgeStaleData: async () => {
    if (mode === "purge-failure" || mode === "route-failure")
      throw new Error("password=private-secret")
    if (mode === "route-busy") await gate
    return null
  },
}))
mock.module("@/lib/pastes/rollup", () => ({ rollUpAnalytics: async () => null }))
mock.module("@/lib/request-admission", () => ({
  runMaintenanceWork: (work: () => unknown) => work(),
}))

if (mode?.startsWith("route")) {
  process.env.METRICS_TOKEN = "fixture-operator-token"
  const { POST } = await import("@/app/api/jobs/[name]/route")
  const call = () =>
    POST(
      new Request("http://localhost/api/jobs/purge", {
        method: "POST",
        headers: { authorization: "Bearer fixture-operator-token" },
      }),
      { params: Promise.resolve({ name: "purge" }) },
    )
  const first = call()
  const response = mode === "route-busy" ? await call() : await first
  release()
  await first
  console.log(
    `fixture:${JSON.stringify({ status: response.status, report: await response.json(), notifications })}`,
  )
} else {
  const { runJob } = await import("@/lib/jobs")
  const report = await runJob(mode?.startsWith("purge") ? "purge" : "email")
  console.log(`fixture:${JSON.stringify({ report, notifications })}`)
}
