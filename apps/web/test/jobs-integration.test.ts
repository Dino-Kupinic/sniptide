import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test"
import { sql } from "drizzle-orm"
import { POST } from "@/app/api/jobs/[name]/route"
import { GET as metrics } from "@/app/api/metrics/route"
import { getDb } from "@/lib/db"
import { jobStatus, runJob, stopMaintenanceJobs } from "@/lib/jobs"
import { hasDatabase, resetDatabase } from "./harness"

const describeDb = hasDatabase ? describe : describe.skip
const originalToken = process.env.METRICS_TOKEN
function request(name: string, token = "jobs-test-token") {
  return POST(
    new Request(`http://localhost/api/jobs/${name}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    }),
    { params: Promise.resolve({ name }) },
  )
}

describeDb("operator maintenance jobs", () => {
  beforeEach(async () => {
    await resetDatabase()
    process.env.METRICS_TOKEN = "jobs-test-token"
  })
  afterEach(() => {
    if (originalToken === undefined) delete process.env.METRICS_TOKEN
    else process.env.METRICS_TOKEN = originalToken
  })
  afterAll(async () => {
    await stopMaintenanceJobs()
    await resetDatabase()
  })

  test("operator authorization is required and job names are finite", async () => {
    expect((await request("usage", "wrong-token")).status).toBe(401)
    expect((await request("__proto__")).status).toBe(404)
    delete process.env.METRICS_TOKEN
    expect((await request("usage")).status).toBe(404)
  })

  test("jobs run without startup timers and report progress through protected metrics", async () => {
    for (const name of ["purge", "analytics", "usage"] as const) {
      const response = await request(name)
      expect(response.status).toBe(200)
      expect(response.headers.get("cache-control")).toBe("private, no-store")
      expect(await response.json()).toMatchObject({ name, outcome: "completed" })
      expect(jobStatus().jobs[name]?.lastSucceededAt).toBeNumber()
    }
    const response = await metrics(
      new Request("http://localhost/api/metrics", {
        headers: { authorization: "Bearer jobs-test-token" },
      }),
    )
    expect(response.status).toBe(200)
    expect((await response.json()).maintenanceJobs).toMatchObject({
      scope: "process",
      resetsOnRestart: true,
    })
  })

  test("a held database advisory lock reports contention without inventing a success", async () => {
    await getDb().transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${0x5e1d_7a1f})`)
      const previous = jobStatus().jobs.analytics?.lastSucceededAt
      const report = await runJob("analytics")
      expect(report.outcome).toBe("contended")
      expect(jobStatus().jobs.analytics?.lastSucceededAt).toBe(previous)
    })
  })
})
