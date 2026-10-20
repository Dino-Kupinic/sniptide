import { describe, expect, test } from "bun:test"
import { Autosaver, type AutosaveState, type SaveOutcome } from "@/lib/autosave/autosaver"
import { draftKey, memoryDrafts } from "@/lib/autosave/drafts"

// The auto-save rules, run against a fake clock so "after a pause" and "after 15 seconds" don't
// take real time.

interface Doc {
  text: string
}

function clock() {
  let time = 0
  let next = 0
  const pending = new Map<number, { at: number; run: () => void }>()
  return {
    now: () => time,
    timers: {
      set(run: () => void, ms: number) {
        next += 1
        pending.set(next, { at: time + ms, run })
        return next
      },
      clear(handle: unknown) {
        pending.delete(handle as number)
      },
    },
    // Moves time forward, running timers (and the promises they start) in order.
    async advance(ms: number) {
      const target = time + ms
      for (;;) {
        const due = [...pending.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        pending.delete(due[0])
        time = due[1].at
        due[1].run()
        await Bun.sleep(0)
      }
      time = target
      await Bun.sleep(0)
    },
  }
}

function setup(
  options: {
    save?: (doc: Doc) => Promise<SaveOutcome<Doc>>
    validate?: (doc: Doc) => string | null
    manual?: boolean
  } = {},
) {
  const fake = clock()
  const sent: Doc[] = []
  const states: AutosaveState[] = []
  let inFlight = 0
  let overlapped = false
  const autosaver = new Autosaver<Doc>({
    initial: { text: "" },
    delayMs: 1000,
    maxWaitMs: 5000,
    retryDelaysMs: [2000, 4000],
    timers: fake.timers,
    now: fake.now,
    validate: options.validate,
    manual: options.manual,
    isOffline: () => true,
    onState: (state) => states.push(state),
    async save(doc) {
      inFlight += 1
      if (inFlight > 1) overlapped = true
      sent.push(doc)
      try {
        return options.save ? await options.save(doc) : { ok: true }
      } finally {
        inFlight -= 1
      }
    },
  })
  return { autosaver, fake, sent, states, overlapped: () => overlapped }
}

const doc = (text: string): Doc => ({ text })

describe("Autosaver", () => {
  test("saves the latest value once typing pauses", async () => {
    const { autosaver, fake, sent } = setup()

    autosaver.update(doc("a"))
    await fake.advance(600)
    autosaver.update(doc("ab"))
    await fake.advance(600)
    expect(sent).toEqual([])

    await fake.advance(500)
    expect(sent).toEqual([doc("ab")])
    expect(autosaver.state.kind).toBe("saved")
    expect(autosaver.hasUnsavedChanges()).toBe(false)
  })

  test("saves during endless typing once the maximum wait has passed", async () => {
    const { autosaver, fake, sent } = setup()

    for (let i = 1; i <= 8; i++) {
      autosaver.update(doc("x".repeat(i)))
      await fake.advance(700)
    }
    // The edits were never more than 700 ms apart, so only the maximum wait can have saved.
    expect(sent.length).toBe(1)
    expect(sent[0]?.text.length).toBeGreaterThanOrEqual(7)
  })

  test("never runs two saves at once and saves edits made meanwhile afterwards", async () => {
    let release: (() => void) | undefined
    const { autosaver, fake, sent, overlapped } = setup({
      save: (value) =>
        value.text === "one"
          ? new Promise((resolve) => {
              release = () => resolve({ ok: true })
            })
          : Promise.resolve({ ok: true }),
    })

    autosaver.update(doc("one"))
    await fake.advance(1000)
    expect(autosaver.state.kind).toBe("saving")

    autosaver.update(doc("two"))
    await fake.advance(5000)
    expect(sent).toEqual([doc("one")])

    release?.()
    await Bun.sleep(0)
    await fake.advance(1000)
    expect(sent).toEqual([doc("one"), doc("two")])
    expect(overlapped()).toBe(false)
    expect(autosaver.state.kind).toBe("saved")
  })

  test("keeps retrying a save that throws, with backoff, until it works", async () => {
    let failures = 2
    const { autosaver, fake, sent, states } = setup({
      save: async () => {
        if (failures-- > 0) throw new Error("network")
        return { ok: true }
      },
    })

    autosaver.update(doc("a"))
    await fake.advance(1000)
    expect(states.at(-1)).toEqual({ kind: "retrying", attempt: 1, offline: true })

    await fake.advance(2000)
    expect(states.at(-1)).toEqual({ kind: "retrying", attempt: 2, offline: true })
    expect(sent.length).toBe(2)

    await fake.advance(4000)
    expect(sent.length).toBe(3)
    expect(autosaver.state.kind).toBe("saved")
    expect(autosaver.hasUnsavedChanges()).toBe(false)
  })

  test("retryNow tries again without waiting for the backoff", async () => {
    let offline = true
    const { autosaver, fake, sent } = setup({
      save: async () => {
        if (offline) throw new Error("network")
        return { ok: true }
      },
    })

    autosaver.update(doc("a"))
    await fake.advance(1000)
    expect(autosaver.state.kind).toBe("retrying")

    offline = false
    autosaver.retryNow()
    await fake.advance(0)
    expect(sent.length).toBe(2)
    expect(autosaver.state.kind).toBe("saved")
  })

  test("does not retry a refused save, but the next edit tries again", async () => {
    let refuse = true
    const { autosaver, fake, sent } = setup({
      save: async () => (refuse ? { ok: false, error: "Too many edits" } : { ok: true }),
    })

    autosaver.update(doc("a"))
    await fake.advance(1000)
    expect(autosaver.state).toEqual({ kind: "error", message: "Too many edits" })

    await fake.advance(60_000)
    expect(sent.length).toBe(1)

    refuse = false
    autosaver.update(doc("ab"))
    await fake.advance(1000)
    expect(sent.length).toBe(2)
    expect(autosaver.state.kind).toBe("saved")
  })

  test("stops on a conflict and saves the person's version once they keep it", async () => {
    let conflict = true
    const { autosaver, fake, sent } = setup({
      save: async () => (conflict ? { ok: false, conflict: true } : { ok: true }),
    })

    autosaver.update(doc("mine"))
    await fake.advance(1000)
    expect(autosaver.state.kind).toBe("conflict")

    autosaver.update(doc("mine, more"))
    await fake.advance(30_000)
    expect(sent.length).toBe(1)

    conflict = false
    autosaver.resolveConflict()
    await fake.advance(1000)
    expect(sent.at(-1)).toEqual(doc("mine, more"))
    expect(autosaver.state.kind).toBe("saved")
  })

  test("a conflict announced by another tab stops saving too", async () => {
    const { autosaver, fake, sent } = setup()

    autosaver.update(doc("mine"))
    autosaver.markConflict()
    await fake.advance(30_000)
    expect(sent).toEqual([])
    expect(autosaver.state.kind).toBe("conflict")

    autosaver.rebase(doc("theirs"))
    expect(autosaver.hasUnsavedChanges()).toBe(false)
    expect(autosaver.state.kind).toBe("idle")
  })

  test("holds back a value that can't be saved yet, then saves it once it can", async () => {
    const { autosaver, fake, sent } = setup({
      validate: (value) => (value.text ? null : "add a title"),
    })

    autosaver.update(doc("a"))
    await fake.advance(1000)
    expect(sent.length).toBe(1)

    autosaver.update(doc(""))
    await fake.advance(10_000)
    expect(autosaver.state).toEqual({ kind: "blocked", reason: "add a title" })
    expect(sent.length).toBe(1)
    expect(await autosaver.flush()).toBe(false)

    autosaver.update(doc("b"))
    await fake.advance(1000)
    expect(sent.at(-1)).toEqual(doc("b"))
  })

  test("flush saves at once and says whether the server has everything", async () => {
    const { autosaver, sent } = setup()

    autosaver.update(doc("a"))
    expect(await autosaver.flush()).toBe(true)
    expect(sent).toEqual([doc("a")])
    expect(await autosaver.flush()).toBe(true)
    expect(sent.length).toBe(1)
  })

  test("flush reports false when the save is refused", async () => {
    const { autosaver, fake, sent } = setup({ save: async () => ({ ok: false, error: "nope" }) })

    autosaver.update(doc("a"))
    expect(await autosaver.flush()).toBe(false)
    expect(autosaver.hasUnsavedChanges()).toBe(true)
    expect(sent).toEqual([doc("a")])
    expect(await autosaver.flush()).toBe(false)
    await fake.advance(60_000)
    expect(sent).toEqual([doc("a")])
    expect(autosaver.state).toEqual({ kind: "error", message: "nope" })
  })

  test("flush leaves a thrown save on its retry schedule", async () => {
    let offline = true
    const { autosaver, fake, sent } = setup({
      save: async () => {
        if (offline) throw new Error("network")
        return { ok: true }
      },
    })

    autosaver.update(doc("a"))
    expect(await autosaver.flush()).toBe(false)
    expect(sent).toEqual([doc("a")])
    expect(autosaver.state).toEqual({ kind: "retrying", attempt: 1, offline: true })
    expect(autosaver.hasUnsavedChanges()).toBe(true)
    expect(await autosaver.flush()).toBe(false)
    await fake.advance(1999)
    expect(sent).toEqual([doc("a")])

    offline = false
    await fake.advance(1)
    expect(sent).toEqual([doc("a"), doc("a")])
    expect(autosaver.state.kind).toBe("saved")
    expect(autosaver.hasUnsavedChanges()).toBe(false)
  })

  test("flush waits for an existing save and stops if it is refused", async () => {
    let release: (() => void) | undefined
    const { autosaver, fake, sent } = setup({
      save: () => {
        if (release) return Promise.resolve({ ok: false, error: "nope" })
        return new Promise((resolve) => {
          release = () => resolve({ ok: false, error: "nope" })
        })
      },
    })

    autosaver.update(doc("a"))
    await fake.advance(1000)
    const first = autosaver.flush()
    const second = autosaver.flush()
    release?.()
    expect(await Promise.all([first, second])).toEqual([false, false])
    expect(sent).toEqual([doc("a")])
    expect(autosaver.hasUnsavedChanges()).toBe(true)
  })

  test("concurrent flushes drain edits made during a successful save once", async () => {
    let release: (() => void) | undefined
    const { autosaver, sent, overlapped } = setup({
      save: (value) =>
        value.text === "one"
          ? new Promise((resolve) => {
              release = () => resolve({ ok: true })
            })
          : Promise.resolve({ ok: true }),
    })

    autosaver.update(doc("one"))
    const first = autosaver.flush()
    const second = autosaver.flush()
    autosaver.update(doc("two"))
    release?.()
    expect(await Promise.all([first, second])).toEqual([true, true])
    expect(sent).toEqual([doc("one"), doc("two")])
    expect(overlapped()).toBe(false)
    expect(autosaver.hasUnsavedChanges()).toBe(false)
  })

  test("flush stops at a conflict until it is resolved", async () => {
    let conflict = true
    const { autosaver, fake, sent } = setup({
      save: async () => (conflict ? { ok: false, conflict: true } : { ok: true }),
    })

    autosaver.update(doc("mine"))
    expect(await autosaver.flush()).toBe(false)
    autosaver.update(doc("mine, more"))
    expect(await autosaver.flush()).toBe(false)
    await fake.advance(60_000)
    expect(sent).toEqual([doc("mine")])
    expect(autosaver.state.kind).toBe("conflict")

    conflict = false
    autosaver.resolveConflict()
    expect(await autosaver.flush()).toBe(true)
    expect(sent).toEqual([doc("mine"), doc("mine, more")])
  })

  test("retryNow can retry a refused save explicitly", async () => {
    let refuse = true
    const { autosaver, fake, sent } = setup({
      save: async () => (refuse ? { ok: false, error: "nope" } : { ok: true }),
    })

    autosaver.update(doc("a"))
    expect(await autosaver.flush()).toBe(false)
    expect(sent).toEqual([doc("a")])
    refuse = false
    autosaver.retryNow()
    await fake.advance(0)
    expect(sent).toEqual([doc("a"), doc("a")])
    expect(autosaver.hasUnsavedChanges()).toBe(false)
  })

  test("treats the server's normalised value as the saved one", async () => {
    // The server hashed the password / applied the expiry, so the editor resets that field. That
    // reset must not look like a new edit.
    const { autosaver, fake, sent } = setup({
      save: async () => ({ ok: true, saved: doc("normalised") }),
    })

    autosaver.update(doc("typed"))
    await fake.advance(1000)
    autosaver.update(doc("normalised"))
    await fake.advance(10_000)

    expect(sent.length).toBe(1)
    expect(autosaver.hasUnsavedChanges()).toBe(false)
  })

  test("an edit that returns to the saved value cancels the pending save", async () => {
    const { autosaver, fake, sent } = setup()

    autosaver.update(doc("a"))
    await fake.advance(1000)
    autosaver.update(doc("ab"))
    autosaver.update(doc("a"))
    await fake.advance(10_000)

    expect(sent).toEqual([doc("a")])
  })

  test("manual mode tracks unsaved changes but never saves", async () => {
    const { autosaver, fake, sent } = setup({ manual: true })

    autosaver.update(doc("a"))
    await fake.advance(60_000)
    expect(sent).toEqual([])
    expect(autosaver.state.kind).toBe("dirty")
    expect(autosaver.hasUnsavedChanges()).toBe(true)

    autosaver.rebase(doc("a"))
    expect(autosaver.hasUnsavedChanges()).toBe(false)
  })

  test("flushing a manual draft leaves it unsaved without calling the server", async () => {
    const { autosaver, sent } = setup({ manual: true })

    expect(await autosaver.flush()).toBe(true)
    autosaver.update(doc("draft"))
    expect(await autosaver.flush()).toBe(false)
    expect(sent).toEqual([])
    expect(autosaver.state.kind).toBe("dirty")
    expect(autosaver.hasUnsavedChanges()).toBe(true)
  })

  test("reconnecting never sends a manual draft to the server", async () => {
    const { autosaver, fake, sent } = setup({ manual: true })

    autosaver.update(doc("draft"))
    autosaver.retryNow()
    await fake.advance(60_000)
    expect(sent).toEqual([])
    expect(autosaver.state.kind).toBe("dirty")
    expect(autosaver.hasUnsavedChanges()).toBe(true)
  })
})

describe("drafts", () => {
  test("a draft is stored and removed per key", async () => {
    const store = memoryDrafts()
    const key = draftKey("user-1", "abc123")

    expect(await store.get(key)).toBeNull()
    await store.put(key, { baseVersion: 5, savedAt: 1, value: { text: "hi" } })
    expect(await store.get(key)).toEqual({ baseVersion: 5, savedAt: 1, value: { text: "hi" } })

    await store.delete(key)
    expect(await store.get(key)).toBeNull()
  })

  test("accounts and pastes never share a draft", () => {
    expect(draftKey("user-1", "abc")).not.toBe(draftKey("user-2", "abc"))
    expect(draftKey("user-1", "abc")).not.toBe(draftKey("user-1", "abd"))
    expect(draftKey("user-1", undefined)).not.toBe(draftKey("user-1", "new-paste"))
  })
})
