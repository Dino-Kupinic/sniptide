export type JobOutcome = "completed" | "contended" | "failed"
export interface JobDefinition {
  intervalMs: number
  enabled?: () => boolean
  run: () => JobOutcome | PromiseLike<JobOutcome>
}

export interface JobReport {
  name: string
  runId: string | null
  outcome: JobOutcome | "busy" | "disabled"
  startedAt: number | null
  finishedAt: number | null
  durationMs: number | null
  failureCode: "execution_failed" | "work_failed" | null
}

interface JobState {
  running: boolean
  lastStartedAt: number | null
  lastFinishedAt: number | null
  lastSucceededAt: number | null
  lastFailedAt: number | null
  lastFailureCode: JobReport["failureCode"]
  lastOutcome: JobReport["outcome"] | null
  runId: string | null
  durationMs: number | null
}

type Schedule = (work: () => void, intervalMs: number) => () => void
const schedule: Schedule = (work, intervalMs) => {
  const timer = setInterval(work, intervalMs)
  timer.unref()
  return () => clearInterval(timer)
}

export function createJobRunner<Name extends string>(
  definitions: Record<Name, JobDefinition>,
  options: {
    now?: () => number
    schedule?: Schedule
    report?: (report: JobReport) => void
  } = {},
) {
  const now = options.now ?? Date.now
  const observedSince = now()
  const names = Object.keys(definitions) as Name[]
  const states = new Map<Name, JobState>(
    names.map((name) => [
      name,
      {
        running: false,
        lastStartedAt: null,
        lastFinishedAt: null,
        lastSucceededAt: null,
        lastFailedAt: null,
        lastFailureCode: null,
        lastOutcome: null,
        runId: null,
        durationMs: null,
      },
    ]),
  )
  const active = new Map<Name, Promise<JobReport>>()
  const timers: (() => void)[] = []

  function stateOf(name: Name) {
    const state = states.get(name)
    if (!state) throw new Error("Unknown maintenance job.")
    return state
  }

  async function run(name: Name): Promise<JobReport> {
    const state = stateOf(name)
    const definition = definitions[name]
    if (state.running) {
      return {
        name,
        runId: state.runId,
        outcome: "busy",
        startedAt: state.lastStartedAt,
        finishedAt: null,
        durationMs: null,
        failureCode: null,
      }
    }
    if (definition.enabled && !definition.enabled()) {
      state.lastOutcome = "disabled"
      return {
        name,
        runId: null,
        outcome: "disabled",
        startedAt: null,
        finishedAt: null,
        durationMs: null,
        failureCode: null,
      }
    }
    state.running = true
    const runId = crypto.randomUUID()
    const startedAt = now()
    state.runId = runId
    state.lastStartedAt = startedAt
    const pending = Promise.resolve().then(async (): Promise<JobReport> => {
      let outcome: JobOutcome
      let failureCode: JobReport["failureCode"] = null
      try {
        outcome = await definition.run()
        if (outcome === "failed") failureCode = "work_failed"
      } catch {
        outcome = "failed"
        failureCode = "execution_failed"
      }
      const finishedAt = now()
      const durationMs = Math.max(0, finishedAt - startedAt)
      const report = { name, runId, outcome, startedAt, finishedAt, durationMs, failureCode }
      state.running = false
      state.lastFinishedAt = finishedAt
      state.lastOutcome = outcome
      state.durationMs = durationMs
      if (outcome === "completed") state.lastSucceededAt = finishedAt
      if (outcome === "failed") {
        state.lastFailedAt = finishedAt
        state.lastFailureCode = failureCode
      }
      active.delete(name)
      options.report?.(report)
      return report
    })
    active.set(name, pending)
    return pending
  }

  function snapshot() {
    const at = now()
    return Object.fromEntries(
      names.map((name) => {
        const state = stateOf(name)
        const definition = definitions[name]
        const enabled = definition.enabled?.() ?? true
        const nextDueAt = enabled
          ? (state.lastSucceededAt ?? observedSince) + definition.intervalMs
          : null
        return [
          name,
          {
            ...state,
            enabled,
            intervalMs: definition.intervalMs,
            nextDueAt,
            overdue: nextDueAt !== null && at > nextDueAt + definition.intervalMs,
          },
        ]
      }),
    )
  }

  return {
    run,
    snapshot,
    start() {
      if (timers.length) return
      for (const name of names) {
        const tick = () => {
          void run(name)
        }
        timers.push((options.schedule ?? schedule)(tick, definitions[name].intervalMs))
        tick()
      }
    },
    async stop() {
      for (const cancel of timers.splice(0)) cancel()
      await Promise.allSettled(active.values())
    },
  }
}
