import { afterEach, describe, expect, test } from "bun:test"
import { indexedDbDrafts, memoryDrafts } from "@/lib/autosave/drafts"

const original = Object.getOwnPropertyDescriptor(globalThis, "indexedDB")
afterEach(() => {
  if (original) Object.defineProperty(globalThis, "indexedDB", original)
  else Reflect.deleteProperty(globalThis, "indexedDB")
})

function storage(failure?: "blocked" | "abort" | "quota" | "open") {
  let closed = 0
  let writes = 0
  const request = { result: "draft" }
  const transaction = {
    error: new Error("storage failed"),
    oncomplete: null as (() => void) | null,
    onerror: null as (() => void) | null,
    onabort: null as (() => void) | null,
    objectStore: () => ({
      put() {
        writes += 1
        if (failure === "quota") throw new DOMException("full", "QuotaExceededError")
        if (failure === "abort") queueMicrotask(() => transaction.onabort?.())
        return request
      },
    }),
  }
  const db = {
    transaction: () => transaction,
    close: () => {
      closed += 1
    },
  }
  const openRequest = {
    result: db,
    error: new Error("open failed"),
    onupgradeneeded: null as (() => void) | null,
    onsuccess: null as (() => void) | null,
    onerror: null as (() => void) | null,
    onblocked: null as (() => void) | null,
  }
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: {
      open() {
        queueMicrotask(() => {
          if (failure === "blocked") openRequest.onblocked?.()
          else if (failure === "open") openRequest.onerror?.()
          else openRequest.onsuccess?.()
        })
        return openRequest
      },
    },
  })
  return { transaction, openRequest, writes: () => writes, closed: () => closed }
}

const draft = { value: "typed text", baseVersion: null, savedAt: 1 }

describe("local draft write acknowledgement", () => {
  test("memory storage acknowledges saved content", async () => {
    const store = memoryDrafts()
    expect(await store.put("draft", draft)).toEqual({ kind: "saved" })
    expect(await store.get("draft")).toEqual(draft)
  })

  test("missing IndexedDB reports unavailable", async () => {
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: undefined })
    expect(await indexedDbDrafts.put("draft", draft)).toEqual({ kind: "unavailable" })
  })

  for (const failure of ["blocked", "open", "abort", "quota"] as const) {
    test(`${failure} reports unavailable`, async () => {
      const fake = storage(failure)
      expect(await indexedDbDrafts.put("draft", draft)).toEqual({ kind: "unavailable" })
      if (failure === "abort" || failure === "quota") expect(fake.closed()).toBe(1)
      if (failure === "blocked") {
        fake.openRequest.onsuccess?.()
        expect(fake.closed()).toBe(1)
      }
    })
  }

  test("request success is insufficient until the transaction commits", async () => {
    const fake = storage()
    let settled = false
    const saving = indexedDbDrafts.put("draft", draft).then((result) => {
      settled = true
      return result
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(fake.writes()).toBe(1)
    expect(settled).toBe(false)
    fake.transaction.oncomplete?.()
    expect(await saving).toEqual({ kind: "saved" })
    expect(fake.closed()).toBe(1)
  })
})
