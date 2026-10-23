import { describe, expect, test } from "bun:test"
import { DraftBackupWriter } from "@/lib/autosave/draft-writer"
import { type DraftStore, memoryDrafts } from "@/lib/autosave/drafts"

const dirty = (value: string, baseVersion = 1) => ({
  kind: "dirty" as const,
  value,
  baseVersion,
})

function writer(store: DraftStore, key = "account:paste") {
  const scheduled = new Map<object, () => void>()
  return new DraftBackupWriter<string>({
    key,
    store,
    timers: {
      set(callback) {
        const handle = {}
        scheduled.set(handle, callback)
        return handle
      },
      clear(handle) {
        if (typeof handle === "object" && handle !== null) scheduled.delete(handle)
      },
    },
  })
}

describe("local draft lifetime", () => {
  test("leaving before the debounce stores the latest committed edit", async () => {
    const store = memoryDrafts()
    const backup = writer(store)
    backup.update(dirty("first"))
    backup.update(dirty("latest"))
    expect(await backup.flush()).toEqual({ kind: "saved" })
    expect((await backup.read())?.value).toBe("latest")
  })

  test("duplicate lifecycle flushes share the same write", async () => {
    const memory = memoryDrafts()
    let writes = 0
    const backup = writer({
      ...memory,
      async put(key, draft) {
        writes += 1
        return memory.put(key, draft)
      },
    })
    backup.update(dirty("latest"))
    await Promise.all([backup.flush(), backup.flush()])
    expect(writes).toBe(1)
  })

  test("StrictMode cleanup does not disable later edits", async () => {
    const backup = writer(memoryDrafts())
    backup.update(dirty("first"))
    await backup.flush()
    backup.update(dirty("second"))
    await backup.flush()
    expect((await backup.read())?.value).toBe("second")
  })

  test("discarded edits are not recreated by cleanup or equal rerenders", async () => {
    const backup = writer(memoryDrafts())
    backup.update(dirty("created"))
    await backup.flush()
    await backup.discard()
    backup.update({ kind: "clean" })
    backup.update({ kind: "paused" })
    backup.update(dirty("created", 2))
    expect(await backup.flush()).toEqual({ kind: "skipped" })
    expect(await backup.read()).toBeNull()
    backup.update(dirty("a later edit", 2))
    expect(await backup.flush()).toEqual({ kind: "saved" })
    expect((await backup.read())?.value).toBe("a later edit")
  })

  test("rejecting an offered old draft still permits the person's current edits", async () => {
    const store = memoryDrafts()
    await store.put("account:paste", { value: "old draft", baseVersion: 0, savedAt: 1 })
    const backup = writer(store)
    backup.update({ kind: "paused" })
    await backup.discard()
    backup.update(dirty("already typed"))
    await backup.flush()
    expect((await backup.read())?.value).toBe("already typed")
  })

  test("a remounted editor's delete and read wait for a departing write", async () => {
    const memory = memoryDrafts()
    let release: () => void = () => {}
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const store: DraftStore = {
      ...memory,
      async put(key, draft) {
        if (key === "account:paste") await blocked
        return memory.put(key, draft)
      },
    }
    const departing = writer(store)
    departing.update(dirty("departing edit"))
    const saving = departing.flush()
    const remounted = writer(store)
    const discarding = remounted.discard()
    const reading = remounted.read()
    const independent = writer(store, "other-account:paste")
    independent.update(dirty("other account"))
    await independent.flush()
    expect((await independent.read())?.value).toBe("other account")
    release()
    await Promise.all([saving, discarding])
    expect(await reading).toBeNull()
  })

  test("new edits after an in-flight discard persist after the deletion", async () => {
    const backup = writer(memoryDrafts())
    backup.update(dirty("old"))
    const saving = backup.flush()
    const discarding = backup.discard()
    backup.update(dirty("new"))
    await Promise.all([saving, discarding, backup.flush()])
    expect((await backup.read())?.value).toBe("new")
  })

  test("scope replacement flushes only its own content", async () => {
    const store = memoryDrafts()
    const previous = writer(store, "first-account:first-paste")
    previous.update(dirty("first"))
    const next = writer(store, "second-account:second-paste")
    next.update(dirty("second"))
    await Promise.all([previous.flush(), next.flush()])
    expect((await previous.read())?.value).toBe("first")
    expect((await next.read())?.value).toBe("second")
  })

  test("clean and paused snapshots never create drafts", async () => {
    const backup = writer(memoryDrafts())
    expect(await backup.flush()).toEqual({ kind: "skipped" })
    backup.update(dirty("unsaved"))
    backup.update({ kind: "clean" })
    expect(await backup.flush()).toEqual({ kind: "skipped" })
    expect(await backup.read()).toBeNull()
  })
})

describe("local draft save outcomes", () => {
  test("unavailable writes remain retryable without changing the edit", async () => {
    const memory = memoryDrafts()
    let attempts = 0
    const backup = writer({
      ...memory,
      async put(key, draft) {
        attempts += 1
        if (attempts === 1) return { kind: "unavailable" }
        return memory.put(key, draft)
      },
    })
    backup.update(dirty("keep this edit"))
    expect(await backup.flush()).toEqual({ kind: "unavailable" })
    expect(await backup.flush()).toEqual({ kind: "saved" })
    expect(attempts).toBe(2)
    expect((await backup.read())?.value).toBe("keep this edit")
  })

  test("duplicate flushes await the same transaction outcome", async () => {
    const memory = memoryDrafts()
    let release: () => void = () => {}
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    let writes = 0
    let finished = 0
    const backup = writer({
      ...memory,
      async put(key, draft) {
        writes += 1
        await pending
        return memory.put(key, draft)
      },
    })
    backup.update(dirty("pending"))
    const first = backup.flush().then((result) => {
      finished += 1
      return result
    })
    const second = backup.flush().then((result) => {
      finished += 1
      return result
    })
    await Promise.resolve()
    expect(writes).toBe(1)
    expect(finished).toBe(0)
    release()
    expect(await Promise.all([first, second])).toEqual([{ kind: "saved" }, { kind: "saved" }])
  })

  test("an earlier unavailable write does not invalidate a newer pending save", async () => {
    const memory = memoryDrafts()
    let release: () => void = () => {}
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    let writes = 0
    const backup = writer({
      ...memory,
      async put(key, draft) {
        writes += 1
        if (draft.value === "first") {
          await pending
          return { kind: "unavailable" }
        }
        return memory.put(key, draft)
      },
    })
    backup.update(dirty("first"))
    const first = backup.flush()
    backup.update(dirty("second"))
    const second = backup.flush()
    release()
    expect(await first).toEqual({ kind: "unavailable" })
    expect(await second).toEqual({ kind: "saved" })
    expect(await backup.flush()).toEqual({ kind: "saved" })
    expect(writes).toBe(2)
    expect((await backup.read())?.value).toBe("second")
  })
})
