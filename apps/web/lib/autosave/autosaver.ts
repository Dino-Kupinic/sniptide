// Debounced, serialized auto-save with retry. It knows nothing about React, the DOM or what is
// being saved, so the timing rules can be tested with a fake clock.
//
// The rules:
// - Edits wait for a quiet moment (`delayMs`), but never longer than `maxWaitMs` since the first
//   unsaved edit, so a long burst of typing still reaches the server.
// - One save runs at a time. Edits made while it runs are saved right after it, in one more save.
// - A save that throws (offline, server down) is retried with backoff until it works.
// - A save the server refuses is not retried; the next edit tries again.
// - A conflict stops saving until the caller settles it with `resolveConflict` or `rebase`.

export type AutosaveState =
  // Nothing has changed since the editor opened.
  | { kind: "idle" }
  // Changes are waiting for the debounce.
  | { kind: "dirty" }
  // Changes that can't be saved yet (say, an empty title). `reason` tells the person why.
  | { kind: "blocked"; reason: string }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  // The save threw; trying again. `offline` is the browser's own opinion of the connection.
  | { kind: "retrying"; attempt: number; offline: boolean }
  // The server refused the save for a reason the person can act on.
  | { kind: "error"; message: string }
  // The server has a newer version than the one these edits started from.
  | { kind: "conflict" }

export type SaveOutcome<T> =
  // `saved` is the value to treat as clean when the server normalised the edit (an expiry that was
  // applied, a password that was hashed). Defaults to what was sent.
  { ok: true; saved?: T } | { ok: false; error: string } | { ok: false; conflict: true }

export interface Timers {
  set(callback: () => void, ms: number): unknown
  clear(handle: unknown): void
}

const realTimers: Timers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export interface AutosaverOptions<T> {
  // The value as stored on the server right now.
  initial: T
  save(value: T): Promise<SaveOutcome<T>>
  // Returns why the value can't be saved yet, or null when it can.
  validate?(value: T): string | null
  onState(state: AutosaveState): void
  delayMs?: number
  maxWaitMs?: number
  // Wait before retry 1, 2, 3…; the last one repeats.
  retryDelaysMs?: number[]
  // Only track whether there are unsaved changes; never save on its own. For a paste that doesn't
  // exist yet, where creating it is the person's decision.
  manual?: boolean
  // Whether the browser thinks it is offline, for the "retrying" state.
  isOffline?(): boolean
  now?(): number
  timers?: Timers
}

export class Autosaver<T> {
  private readonly options: AutosaverOptions<T>
  private readonly timers: Timers
  private readonly delayMs: number
  private readonly maxWaitMs: number
  private readonly retryDelaysMs: number[]

  private current: T
  private savedKey: string
  private lastState: AutosaveState = { kind: "idle" }
  private everSaved = false
  private conflicted = false
  private disposed = false
  private attempt = 0
  private inflight: Promise<void> | null = null

  private debounceTimer: unknown = null
  private maxWaitTimer: unknown = null
  private retryTimer: unknown = null

  constructor(options: AutosaverOptions<T>) {
    this.options = options
    this.timers = options.timers ?? realTimers
    this.delayMs = options.delayMs ?? 1500
    this.maxWaitMs = options.maxWaitMs ?? 15_000
    this.retryDelaysMs = options.retryDelaysMs ?? [2000, 4000, 8000, 16_000, 30_000]
    this.current = options.initial
    this.savedKey = JSON.stringify(options.initial)
  }

  get state() {
    return this.lastState
  }

  // Whether the latest edit has reached the server.
  hasUnsavedChanges() {
    return JSON.stringify(this.current) !== this.savedKey
  }

  // Call with the whole value every time it may have changed.
  update(value: T) {
    if (this.disposed) return
    this.current = value

    if (!this.hasUnsavedChanges()) {
      this.cancelTimers()
      // Edits that came back to what the server has need no save.
      if (this.lastState.kind !== "saving" && this.lastState.kind !== "conflict") {
        this.set(this.everSaved ? { kind: "saved", at: this.now() } : { kind: "idle" })
      }
      return
    }
    // A conflict waits for the person; keep the latest edits so resolving it saves them.
    if (this.conflicted) return

    if (this.options.manual) {
      this.set({ kind: "dirty" })
      return
    }

    this.clear("retryTimer")
    this.attempt = 0
    const reason = this.options.validate?.(value) ?? null
    if (reason) {
      this.cancelTimers()
      this.set({ kind: "blocked", reason })
      return
    }

    // While a save runs the result decides what comes next.
    if (this.inflight) return
    this.set({ kind: "dirty" })
    this.schedule()
  }

  // Saves now if there is anything to save, and resolves once the server has it (true) or the
  // edits can't be saved right now (false).
  async flush() {
    if (this.disposed) return true
    for (let round = 0; round < 3; round++) {
      if (this.inflight) await this.inflight
      if (!this.hasUnsavedChanges()) return true
      if (this.conflicted || this.options.validate?.(this.current)) return false
      await this.run()
    }
    return !this.hasUnsavedChanges()
  }

  // The person chose to keep their edits over what the server has: the caller has pointed the
  // save at the newer version, so save again.
  resolveConflict() {
    this.conflicted = false
    this.update(this.current)
  }

  // The person chose the server's version (or loaded it): treat `value` as stored and clean.
  rebase(value: T) {
    this.cancelTimers()
    this.conflicted = false
    this.attempt = 0
    this.current = value
    this.savedKey = JSON.stringify(value)
    this.set({ kind: "idle" })
  }

  // Another tab saved. Stop saving over it until the person decides.
  markConflict() {
    if (this.disposed || this.conflicted) return
    this.conflicted = true
    this.cancelTimers()
    this.set({ kind: "conflict" })
  }

  // Tries again now, e.g. when the browser comes back online.
  retryNow() {
    if (this.disposed || this.conflicted || !this.hasUnsavedChanges() || this.inflight) return
    this.cancelTimers()
    void this.run()
  }

  dispose() {
    this.disposed = true
    this.cancelTimers()
  }

  private now() {
    return this.options.now?.() ?? Date.now()
  }

  private set(state: AutosaveState) {
    this.lastState = state
    if (!this.disposed) this.options.onState(state)
  }

  private clear(name: "debounceTimer" | "maxWaitTimer" | "retryTimer") {
    if (this[name] !== null) this.timers.clear(this[name])
    this[name] = null
  }

  private cancelTimers() {
    this.clear("debounceTimer")
    this.clear("maxWaitTimer")
    this.clear("retryTimer")
  }

  private schedule() {
    this.clear("debounceTimer")
    this.debounceTimer = this.timers.set(() => {
      this.debounceTimer = null
      void this.run()
    }, this.delayMs)
    // The first unsaved edit starts the clock; later edits don't push it back.
    if (this.maxWaitTimer === null) {
      this.maxWaitTimer = this.timers.set(() => {
        this.maxWaitTimer = null
        void this.run()
      }, this.maxWaitMs)
    }
  }

  private run(): Promise<void> {
    this.cancelTimers()
    if (this.inflight) return this.inflight
    if (this.disposed || this.conflicted || !this.hasUnsavedChanges()) return Promise.resolve()

    const reason = this.options.validate?.(this.current) ?? null
    if (reason) {
      this.set({ kind: "blocked", reason })
      return Promise.resolve()
    }

    const sent = this.current
    this.set({ kind: "saving" })
    this.inflight = (async () => {
      let outcome: SaveOutcome<T>
      try {
        outcome = await this.options.save(sent)
      } catch {
        this.attempt += 1
        this.set({
          kind: "retrying",
          attempt: this.attempt,
          offline: this.options.isOffline?.() ?? false,
        })
        const wait =
          this.retryDelaysMs[Math.min(this.attempt, this.retryDelaysMs.length) - 1] ?? 30_000
        this.retryTimer = this.timers.set(() => {
          this.retryTimer = null
          void this.run()
        }, wait)
        return
      }

      this.attempt = 0
      if (outcome.ok) {
        this.everSaved = true
        this.savedKey = JSON.stringify(outcome.saved ?? sent)
        if (this.hasUnsavedChanges()) {
          // More edits arrived while saving: save them next, after the usual quiet moment.
          const next = this.options.validate?.(this.current) ?? null
          if (next) this.set({ kind: "blocked", reason: next })
          else {
            this.set({ kind: "dirty" })
            this.schedule()
          }
        } else {
          this.set({ kind: "saved", at: this.now() })
        }
      } else if ("conflict" in outcome) {
        this.conflicted = true
        this.set({ kind: "conflict" })
      } else {
        this.set({ kind: "error", message: outcome.error })
      }
    })().finally(() => {
      this.inflight = null
    })
    return this.inflight
  }
}
