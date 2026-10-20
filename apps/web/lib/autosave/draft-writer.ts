import type { Timers } from "./autosaver"
import type { Draft, DraftStore, DraftWriteResult } from "./drafts"

export type DraftSaveResult = DraftWriteResult | { kind: "skipped" }

export type DraftSnapshot<T> =
  | { kind: "paused" }
  | { kind: "clean" }
  | { kind: "dirty"; value: T; baseVersion: number | null }

const pending = new WeakMap<DraftStore, Map<string, Promise<unknown>>>()

function ordered<T>(store: DraftStore, key: string, operation: () => Promise<T>): Promise<T> {
  let keys = pending.get(store)
  if (!keys) {
    keys = new Map()
    pending.set(store, keys)
  }
  const result = (keys.get(key) ?? Promise.resolve()).then(operation, operation)
  keys.set(key, result)
  const settled = () => {
    if (keys.get(key) === result) keys.delete(key)
  }
  void result.then(settled, settled)
  return result
}

export class DraftBackupWriter<T> {
  private snapshot: DraftSnapshot<T> = { kind: "paused" }
  private timer: unknown = null
  private suppressed: string | null = null
  private lastWrite: { key: string; result: Promise<DraftWriteResult> } | null = null
  private readonly timers: Timers

  constructor(
    private readonly options: {
      key: string
      store: DraftStore
      delayMs?: number
      timers?: Timers
    },
  ) {
    this.timers = options.timers ?? {
      set: (callback, delay) => setTimeout(callback, delay),
      clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    }
  }

  read(): Promise<Draft<T> | null> {
    return ordered(this.options.store, this.options.key, () =>
      this.options.store.get<T>(this.options.key),
    )
  }

  update(snapshot: DraftSnapshot<T>) {
    const previous = this.snapshot
    this.snapshot = snapshot
    this.cancel()
    if (snapshot.kind === "paused") return
    if (snapshot.kind === "clean") {
      if (previous.kind !== "clean") {
        this.lastWrite = null
        void this.remove()
      }
      return
    }
    const content = JSON.stringify(snapshot.value)
    if (content === this.suppressed) return
    this.suppressed = null
    const key = JSON.stringify([snapshot.baseVersion, snapshot.value])
    if (this.lastWrite?.key === key) return
    this.timer = this.timers.set(() => void this.flush(), this.options.delayMs ?? 400)
  }

  async flush(): Promise<DraftSaveResult> {
    this.cancel()
    const snapshot = this.snapshot
    if (snapshot.kind !== "dirty" || JSON.stringify(snapshot.value) === this.suppressed)
      return { kind: "skipped" }
    const key = JSON.stringify([snapshot.baseVersion, snapshot.value])
    if (this.lastWrite?.key !== key) {
      const draft = {
        value: snapshot.value,
        baseVersion: snapshot.baseVersion,
        savedAt: Date.now(),
      }
      this.lastWrite = {
        key,
        result: ordered(this.options.store, this.options.key, () =>
          this.options.store.put(this.options.key, draft),
        ),
      }
    }
    const write = this.lastWrite
    const result = await write.result
    if (result.kind === "unavailable" && this.lastWrite === write) this.lastWrite = null
    return result
  }

  discard(): Promise<void> {
    this.cancel()
    if (this.snapshot.kind === "dirty") this.suppressed = JSON.stringify(this.snapshot.value)
    this.lastWrite = null
    return this.remove()
  }

  private remove() {
    return ordered(this.options.store, this.options.key, () =>
      this.options.store.delete(this.options.key),
    )
  }

  private cancel() {
    if (this.timer !== null) this.timers.clear(this.timer)
    this.timer = null
  }
}
