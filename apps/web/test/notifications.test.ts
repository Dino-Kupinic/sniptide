import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { notification, paste, user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { GET as feedRoute } from "@/app/api/notifications/route"
import { getDb } from "@/lib/db"
import { markAllRead, markRead } from "@/lib/notifications/actions"
import { notifyExpiringPastes } from "@/lib/notifications/expiring"
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATION_LIMIT,
} from "@/lib/notifications/store"
import { purgeStaleData } from "@/lib/pastes/purge"
import { leaveShare, readSharedPaste, sharePaste, unsharePaste } from "@/lib/pastes/store"
import { hasDatabase, resetDatabase, seedPaste, seedUser, signInAs } from "./harness"

// The bell's notifications (WRK-136): the events that make them, what the feed returns for whom,
// and how reading them works.

const describeDb = hasDatabase ? describe : describe.skip
const DAY = 86_400_000

async function feedFor(id: string) {
  signInAs(id)
  const feed = await listNotifications()
  if (!feed) throw new Error("expected a signed-in feed")
  return feed
}

async function kinds(id: string) {
  return (await feedFor(id)).items.map((item) => item.kind)
}

describeDb("notifications", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
    await seedUser("reader")
    await seedUser("friend")
    await getDb().update(user).set({ name: "Frida Friend" }).where(eq(user.id, "friend"))
  })

  test("the feed needs a session", async () => {
    signInAs(null)
    expect(await listNotifications()).toBeNull()
    const response = await feedRoute()
    expect(response.status).toBe(401)
  })

  test("a new account has none", async () => {
    expect(await feedFor("owner")).toEqual({ items: [], unread: 0 })
  })

  test("a burned paste tells its owner, once, and links to the trash", async () => {
    await seedPaste({ slug: "burn", owner: "owner", burnAfterRead: true })
    signInAs("reader")
    expect((await readSharedPaste("burn", { reveal: true })).status).toBe("ok")
    expect((await readSharedPaste("burn", { reveal: true })).status).toBe("missing")

    const feed = await feedFor("owner")
    expect(feed.unread).toBe(1)
    expect(feed.items).toHaveLength(1)
    expect(feed.items[0]).toMatchObject({
      kind: "burned",
      read: false,
      href: "/trash",
      title: "“title-of-burn” was read",
    })
    // The reader has nothing of their own to be told.
    expect(await kinds("reader")).toEqual([])
  })

  test("the owner reading their own paste is not news", async () => {
    await seedPaste({ slug: "mine", owner: "owner", visibility: "public" })
    signInAs("owner")
    await readSharedPaste("mine", { visit: true })
    expect(await kinds("owner")).toEqual([])
  })

  test("a paste reaching 10 views tells its owner, and the 11th does not", async () => {
    await seedPaste({ slug: "popular", owner: "owner", visibility: "public" })
    await getDb().update(paste).set({ views: 8 }).where(eq(paste.slug, "popular"))
    signInAs("reader")
    await readSharedPaste("popular", { visit: true })
    expect(await kinds("owner")).toEqual([])
    signInAs("reader")
    await readSharedPaste("popular", { visit: true })
    expect(await kinds("owner")).toEqual(["views"])
    signInAs("reader")
    await readSharedPaste("popular", { visit: true })

    const feed = await feedFor("owner")
    expect(feed.items).toHaveLength(1)
    expect(feed.items[0]).toMatchObject({
      title: "“title-of-popular” reached 10 views",
      href: "/analytics?paste=popular",
    })
  })

  test("sharing a paste tells the person, naming who shared", async () => {
    await getDb().update(user).set({ name: "Olive Owner" }).where(eq(user.id, "owner"))
    await seedPaste({ slug: "shared", owner: "owner", visibility: "private" })
    signInAs("owner")
    expect(await sharePaste("shared", "friend", "view")).toBe(true)
    // Changing the access they have is not a new share.
    expect(await sharePaste("shared", "friend", "edit")).toBe(true)

    const feed = await feedFor("friend")
    expect(feed.items).toHaveLength(1)
    expect(feed.items[0]).toMatchObject({
      kind: "shared",
      title: "Olive Owner shared “title-of-shared” with you",
      href: "/pastes/shared",
    })
    expect(await kinds("owner")).toEqual([])
  })

  test("removing the share, or leaving it, takes the notification with it", async () => {
    await seedPaste({ slug: "shared", owner: "owner", visibility: "private" })
    signInAs("owner")
    await sharePaste("shared", "friend", "view")
    await unsharePaste("shared", "friend")
    expect(await kinds("friend")).toEqual([])

    signInAs("owner")
    await sharePaste("shared", "friend", "view")
    expect(await kinds("friend")).toEqual(["shared"])
    signInAs("friend")
    await leaveShare("shared")
    expect(await kinds("friend")).toEqual([])

    // Inviting someone who left is news again.
    signInAs("owner")
    await sharePaste("shared", "friend", "view")
    expect(await kinds("friend")).toEqual(["shared"])
  })

  test("a paste expiring within a day warns its owner once", async () => {
    const { id } = await seedPaste({
      slug: "soon",
      owner: "owner",
      expiresAt: new Date(Date.now() + 10 * 3_600_000),
    })
    await getDb()
      .update(paste)
      .set({ createdAt: new Date(Date.now() - 6 * DAY) })
      .where(eq(paste.id, id))
    // Chosen to last a day: its owner knows.
    await seedPaste({
      slug: "short",
      owner: "owner",
      expiresAt: new Date(Date.now() + 10 * 3_600_000),
    })
    // Not for a few days yet.
    const later = await seedPaste({
      slug: "later",
      owner: "owner",
      expiresAt: new Date(Date.now() + 3 * DAY),
    })
    await getDb()
      .update(paste)
      .set({ createdAt: new Date(Date.now() - 6 * DAY) })
      .where(eq(paste.id, later.id))

    expect(await notifyExpiringPastes()).toBe(1)
    expect(await notifyExpiringPastes()).toBe(0)

    const feed = await feedFor("owner")
    expect(feed.items).toHaveLength(1)
    expect(feed.items[0]?.kind).toBe("expiring")
    expect(feed.items[0]?.title).toMatch(/^“title-of-soon” expires in \d+ hours$/)
    expect(feed.items[0]?.href).toBe("/pastes/soon")
  })

  test("a paste whose expiry moves is warned about again", async () => {
    const { id } = await seedPaste({
      slug: "moved",
      owner: "owner",
      expiresAt: new Date(Date.now() + 5 * 3_600_000),
    })
    const db = getDb()
    await db
      .update(paste)
      .set({ createdAt: new Date(Date.now() - 6 * DAY) })
      .where(eq(paste.id, id))
    expect(await notifyExpiringPastes()).toBe(1)
    await db
      .update(paste)
      .set({ expiresAt: new Date(Date.now() + 9 * 3_600_000) })
      .where(eq(paste.id, id))
    expect(await notifyExpiringPastes()).toBe(1)
  })

  test("trashed pastes are not warned about", async () => {
    const { id } = await seedPaste({
      slug: "gone",
      owner: "owner",
      expiresAt: new Date(Date.now() + 5 * 3_600_000),
      deletedAt: new Date(),
    })
    await getDb()
      .update(paste)
      .set({ createdAt: new Date(Date.now() - 6 * DAY) })
      .where(eq(paste.id, id))
    expect(await notifyExpiringPastes()).toBe(0)
  })

  test("the feed is newest first, per account, and counts every unread one", async () => {
    const db = getDb()
    const { id } = await seedPaste({ slug: "p", owner: "owner" })
    const total = NOTIFICATION_LIMIT + 5
    await db.insert(notification).values(
      Array.from({ length: total }, (_, index) => ({
        userId: "owner",
        kind: "views" as const,
        pasteId: id,
        count: (index + 1) * 10,
        createdAt: new Date(Date.now() - (total - index) * 60_000),
      })),
    )
    await db
      .insert(notification)
      .values({ userId: "friend", kind: "views", pasteId: id, count: 10 })

    const feed = await feedFor("owner")
    expect(feed.items).toHaveLength(NOTIFICATION_LIMIT)
    expect(feed.unread).toBe(total)
    expect(feed.items[0]?.title).toContain(`${total * 10} views`)
    const times = feed.items.map((item) => item.createdAt)
    expect(times).toEqual([...times].sort((a, b) => b - a))
    expect((await feedFor("friend")).unread).toBe(1)
  })

  test("reading one lowers the count, twice changes nothing, and only the owner can", async () => {
    const { id } = await seedPaste({ slug: "p", owner: "owner" })
    const db = getDb()
    await db.insert(notification).values([
      { userId: "owner", kind: "views", pasteId: id, count: 10 },
      { userId: "owner", kind: "views", pasteId: id, count: 50 },
    ])
    const first = (await feedFor("owner")).items[0]
    if (!first) throw new Error("expected a notification")

    signInAs("reader")
    expect((await markRead(first.id)).ok).toBe(true)
    expect((await feedFor("owner")).unread).toBe(2)

    signInAs("owner")
    expect(await markRead(first.id)).toEqual({ ok: true })
    expect(await markRead(first.id)).toEqual({ ok: true })
    const after = await feedFor("owner")
    expect(after.unread).toBe(1)
    expect(after.items.find((item) => item.id === first.id)?.read).toBe(true)
    expect(after.items.filter((item) => !item.read)).toHaveLength(1)
  })

  test("marking all read clears the badge but keeps the list", async () => {
    const { id } = await seedPaste({ slug: "p", owner: "owner" })
    await getDb()
      .insert(notification)
      .values([
        { userId: "owner", kind: "views", pasteId: id, count: 10 },
        { userId: "owner", kind: "views", pasteId: id, count: 50 },
        { userId: "friend", kind: "views", pasteId: id, count: 10 },
      ])
    signInAs("owner")
    expect(await markAllRead()).toEqual({ ok: true })
    const feed = await feedFor("owner")
    expect(feed.unread).toBe(0)
    expect(feed.items).toHaveLength(2)
    expect(feed.items.every((item) => item.read)).toBe(true)
    expect((await feedFor("friend")).unread).toBe(1)
  })

  test("signed-out calls change nothing", async () => {
    const { id } = await seedPaste({ slug: "p", owner: "owner" })
    await getDb().insert(notification).values({ userId: "owner", kind: "views", pasteId: id })
    const [row] = await getDb().select().from(notification)
    signInAs(null)
    expect(await markNotificationRead(row?.id ?? "")).toBe(false)
    expect(await markAllNotificationsRead()).toBe(false)
    expect((await feedFor("owner")).unread).toBe(1)
  })

  test("deleting a paste deletes its notifications", async () => {
    const { id } = await seedPaste({ slug: "p", owner: "owner" })
    await getDb().insert(notification).values({ userId: "owner", kind: "views", pasteId: id })
    await getDb().delete(paste).where(eq(paste.id, id))
    expect(await feedFor("owner")).toEqual({ items: [], unread: 0 })
  })

  test("maintenance deletes old read notifications and very old unread ones", async () => {
    const { id } = await seedPaste({ slug: "p", owner: "owner" })
    const ago = (days: number) => new Date(Date.now() - days * DAY)
    await getDb()
      .insert(notification)
      .values([
        {
          userId: "owner",
          kind: "views",
          pasteId: id,
          count: 10,
          createdAt: ago(40),
          readAt: ago(31),
        },
        {
          userId: "owner",
          kind: "views",
          pasteId: id,
          count: 50,
          createdAt: ago(40),
          readAt: ago(5),
        },
        { userId: "owner", kind: "views", pasteId: id, count: 100, createdAt: ago(91) },
        { userId: "owner", kind: "views", pasteId: id, count: 500, createdAt: ago(60) },
      ])
    await purgeStaleData()
    const left = (await getDb().select().from(notification)).map((row) => row.count).sort()
    expect(left).toEqual([50, 500])
  })
})
