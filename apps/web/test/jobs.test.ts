import { describe, expect, test } from "bun:test"
import path from "node:path"
import { createJobRunner, type JobOutcome, type JobReport } from "@/lib/jobs/runner"

describe("maintenance job execution", () => {
  test("failures and contention never advance successful execution or hide overdue work", async () => {
    let at = 0
    let outcome: JobOutcome = "completed"
    const runner = createJobRunner(
      { cleanup: { intervalMs: 100, run: async () => outcome } },
      { now: () => at },
    )
    at = 10
    await runner.run("cleanup")
    at = 50
    outcome = "failed"
    await runner.run("cleanup")
    at = 220
    outcome = "contended"
    await runner.run("cleanup")
    expect(runner.snapshot().cleanup).toMatchObject({
      lastSucceededAt: 10,
      lastFailedAt: 50,
      lastFailureCode: "work_failed",
      lastOutcome: "contended",
      overdue: true,
    })
    outcome = "completed"
    await runner.run("cleanup")
    expect(runner.snapshot().cleanup).toMatchObject({
      lastSucceededAt: 220,
      lastFailedAt: 50,
      overdue: false,
    })
  })

  test("overlapping calls return busy without changing the running attempt", async () => {
    let finish: () => void = () => {
      throw new Error("Work did not start")
    }
    const blocked = new Promise<void>((resolve) => {
      finish = resolve
    })
    const runner = createJobRunner({
      cleanup: {
        intervalMs: 100,
        run: async () => {
          await blocked
          return "completed" as const
        },
      },
    })
    const first = runner.run("cleanup")
    const busy = await runner.run("cleanup")
    expect(busy.outcome).toBe("busy")
    expect(runner.snapshot().cleanup?.running).toBe(true)
    finish()
    const completed = await first
    expect(completed.runId).toBe(busy.runId)
    expect(runner.snapshot().cleanup?.running).toBe(false)
  })

  test("disabled work is not executed or overdue and thrown errors expose only a safe code", async () => {
    let enabled = false
    let calls = 0
    let at = 0
    const reports: JobReport[] = []
    const runner = createJobRunner(
      {
        email: {
          intervalMs: 100,
          enabled: () => enabled,
          run: () => {
            calls++
            throw new Error("password=private-secret")
          },
        },
      },
      { now: () => at, report: (report) => reports.push(report) },
    )
    at = 1000
    expect((await runner.run("email")).outcome).toBe("disabled")
    expect(runner.snapshot().email?.overdue).toBe(false)
    expect(calls).toBe(0)
    enabled = true
    expect(await runner.run("email")).toMatchObject({
      outcome: "failed",
      failureCode: "execution_failed",
    })
    expect(JSON.stringify(reports)).not.toContain("private-secret")
    expect(runner.snapshot().email).toMatchObject({
      lastSucceededAt: null,
      lastFailedAt: 1000,
      overdue: true,
    })
    await runner.stop()
  })

  test("startup runs immediately once, uses each cadence, and stop cancels and drains work", async () => {
    const scheduled: { run: () => void; interval: number; canceled: boolean }[] = []
    const calls: string[] = []
    const runner = createJobRunner(
      {
        a: {
          intervalMs: 100,
          run: async () => {
            calls.push("a")
            return "completed" as const
          },
        },
        b: {
          intervalMs: 200,
          run: async () => {
            calls.push("b")
            return "completed" as const
          },
        },
      },
      {
        schedule: (run, interval) => {
          const timer = { run, interval, canceled: false }
          scheduled.push(timer)
          return () => {
            timer.canceled = true
          }
        },
      },
    )
    runner.start()
    runner.start()
    expect(scheduled.map((timer) => timer.interval)).toEqual([100, 200])
    await runner.stop()
    expect(calls).toEqual(["a", "b"])
    expect(scheduled.every((timer) => timer.canceled)).toBe(true)
    runner.start()
    await runner.stop()
    expect(calls).toEqual(["a", "b", "a", "b"])
  })

  test.each([
    "purge-failure",
    "purge-contended",
    "email-failure",
    "email-disabled",
    "route-failure",
    "route-busy",
  ])("registry preserves %s semantics", (mode) => {
    const result = Bun.spawnSync(
      [process.execPath, "--no-env-file", "test/fixtures/job-outcomes.ts", mode],
      {
        cwd: path.join(import.meta.dir, ".."),
      },
    )
    expect(result.exitCode).toBe(0)
    const output = result.stdout.toString()
    expect(output).not.toContain("private-secret")
    const line = output.split("\n").find((line) => line.startsWith("fixture:"))
    if (!line) throw new Error(result.stderr.toString() || "Fixture produced no report")
    const data = JSON.parse(line.slice("fixture:".length))
    if (mode.startsWith("purge")) {
      expect(data.notifications).toBe(1)
      expect(data.report.outcome).toBe(mode === "purge-failure" ? "failed" : "contended")
    } else if (mode.startsWith("route")) {
      expect(data.status).toBe(mode === "route-failure" ? 500 : 409)
      expect(data.report.outcome).toBe(mode === "route-failure" ? "failed" : "busy")
    } else expect(data.report.outcome).toBe(mode === "email-failure" ? "failed" : "disabled")
  })
})
