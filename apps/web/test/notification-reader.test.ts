import { describe, expect, test } from "bun:test"
import { NotificationReader } from "@/lib/notifications/reader"
import type { NotificationFeed } from "@/lib/notifications/types"

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (error: Error) => void = () => {}
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

function setup() {
  const reads: ReturnType<typeof deferred<NotificationFeed>>[] = []
  const feeds: NotificationFeed[] = []
  let failures = 0
  const reader = new NotificationReader({
    read() {
      const next = deferred<NotificationFeed>()
      reads.push(next)
      return next.promise
    },
    publish: (feed) => feeds.push(feed),
    failed: () => failures++,
  })
  return { reader, reads, feeds, failures: () => failures }
}

const feed = (unread: number): NotificationFeed => ({ unread, items: [] })

describe("notification reads", () => {
  test("overlapping poll, focus, and open requests share one read", async () => {
    const { reader, reads, feeds } = setup()
    const first = reader.load()
    expect(reader.load()).toBe(first)
    expect(reader.load()).toBe(first)
    await Promise.resolve()
    expect(reads).toHaveLength(1)
    reads[0]?.resolve(feed(2))
    await first
    expect(feeds).toEqual([feed(2)])
  })

  test("an invalidated result cannot replace or clear a newer request", async () => {
    const { reader, reads, feeds } = setup()
    const first = reader.load()
    reader.invalidate()
    const next = reader.load()
    await Promise.resolve()
    reads[0]?.resolve(feed(8))
    await first
    expect(feeds).toEqual([])
    expect(reader.load()).toBe(next)
    reads[1]?.resolve(feed(1))
    await next
    expect(feeds).toEqual([feed(1)])
  })

  test("overlapping mutations hold reads until both changes finish", async () => {
    const { reader, reads, feeds } = setup()
    const original = reader.load()
    await Promise.resolve()
    const one = deferred<void>()
    const two = deferred<void>()
    const first = reader.mutate(() => one.promise)
    const second = reader.mutate(() => two.promise)
    await reader.load()
    reads[0]?.resolve(feed(8))
    await original
    one.resolve()
    await first
    expect(reads).toHaveLength(1)
    expect(feeds).toEqual([])
    two.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(reads).toHaveLength(2)
    reads[1]?.resolve(feed(0))
    await second
    expect(feeds).toEqual([feed(0)])
  })

  test("a failed mutation still reloads and preserves its error", async () => {
    const { reader, reads, feeds } = setup()
    const change = reader.mutate(async () => {
      throw new Error("not saved")
    })
    await Promise.resolve()
    await Promise.resolve()
    reads[0]?.resolve(feed(3))
    await expect(change).rejects.toThrow("not saved")
    expect(feeds).toEqual([feed(3)])
  })

  test("failed reads release the slot for another attempt", async () => {
    const { reader, reads, feeds, failures } = setup()
    const first = reader.load()
    await Promise.resolve()
    reads[0]?.reject(new Error("offline"))
    await first
    expect(failures()).toBe(1)
    const next = reader.load()
    await Promise.resolve()
    reads[1]?.resolve(feed(1))
    await next
    expect(feeds).toEqual([feed(1)])
  })
})
