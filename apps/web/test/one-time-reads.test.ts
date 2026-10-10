import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import SharePage from "@/app/[slug]/page"
import { GET as raw } from "@/app/[slug]/raw/route"
import { POST as revealRoute } from "@/app/[slug]/reveal/route"
import { readSharedPaste } from "@/lib/pastes/store"
import {
  hasDatabase,
  marker,
  pasteRow,
  request,
  resetDatabase,
  seedPaste,
  seedUser,
  signInAs,
  viewDayTotal,
} from "./harness"

// A burn-after-read paste is handed to exactly one reader, whichever way they ask and however many
// ask at once, and only when they ask for it: opening the share page alone, as link previews do,
// never uses it up. "Allow raw access" holds for everyone but the owner.

const describeDb = hasDatabase ? describe : describe.skip

const params = (slug: string) => ({ params: Promise.resolve({ slug }) }) as never
const rawRequest = (slug: string) => raw(new Request(`http://x/${slug}/raw`), params(slug))

// Whether the paste's body appears anywhere in a rendered tree.
function renders(value: unknown, slug: string, seen = new WeakSet<object>()): boolean {
  if (typeof value === "string") return value.includes(marker(slug))
  if (typeof value !== "object" || value === null || seen.has(value)) return false
  seen.add(value)
  return Object.values(value).some((child) => renders(child, slug, seen))
}

async function reveal(slug: string) {
  const response = await revealRoute(
    new Request(`http://x/${slug}/reveal`, { method: "POST" }),
    params(slug),
  )
  if (response.status === 404) return "404"
  return (await response.text()).includes(marker(slug)) ? "content" : "empty"
}

async function page(slug: string) {
  try {
    return renders(await SharePage(params(slug)), slug) ? "content" : "empty"
  } catch (error) {
    return (error as { digest?: string }).digest?.includes("404") ? "404" : "error"
  }
}

describeDb("one-time reads", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
    await seedUser("other")
    await seedPaste({ slug: "burn", owner: "owner", burnAfterRead: true, allowRaw: false })
    await seedPaste({ slug: "burnraw", owner: "owner", burnAfterRead: true, allowRaw: true })
    await seedPaste({ slug: "plain", owner: "owner", visibility: "public" })
  })

  test("opening the share page shows a sealed paste and doesn't use it up", async () => {
    for (let visit = 0; visit < 3; visit++) expect(await page("burn")).toBe("empty")

    const row = await pasteRow("burn")
    expect(row?.views).toBe(0)
    expect(row?.deletedAt).toBeNull()
  })

  test("link previews and crawlers that open the page don't use it up either", async () => {
    request.headers = new Headers({ "user-agent": "Slackbot-LinkExpanding 1.0" })
    expect(await page("burn")).toBe("empty")
    expect(await reveal("burn")).toBe("content")
  })

  test("crawlers don't count as views of an ordinary paste", async () => {
    request.headers = new Headers({
      "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)",
    })
    expect(await page("plain")).toBe("content")
    expect((await pasteRow("plain"))?.views).toBe(0)
  })

  test("the first reader of a burn-after-read paste gets it and the second gets nothing", async () => {
    expect(await reveal("burn")).toBe("content")
    expect(await reveal("burn")).toBe("404")
    expect(await page("burn")).toBe("404")

    const row = await pasteRow("burn")
    expect(row?.views).toBe(1)
    expect(row?.deletedAt).not.toBeNull()
  })

  test("only one of many simultaneous readers gets a burn-after-read paste", async () => {
    const outcomes = await Promise.all(Array.from({ length: 8 }, () => reveal("burn")))

    expect(outcomes.filter((outcome) => outcome === "content")).toHaveLength(1)
    expect(outcomes.filter((outcome) => outcome === "404")).toHaveLength(7)
    expect((await pasteRow("burn"))?.views).toBe(1)
    expect(await viewDayTotal("burn")).toBe(1)
  })

  test("a password-protected one can't be revealed before it is unlocked", async () => {
    await seedPaste({ slug: "burnpw", owner: "owner", burnAfterRead: true, password: "pw-123" })
    const response = await revealRoute(
      new Request("http://x/burnpw/reveal", { method: "POST" }),
      params("burnpw"),
    )
    expect(response.status).toBe(401)
    expect(await response.text()).not.toContain(marker("burnpw"))
    expect((await pasteRow("burnpw"))?.deletedAt).toBeNull()
  })

  test("the same holds when signed-in readers race", async () => {
    signInAs("other")
    const reads = await Promise.all(
      Array.from({ length: 8 }, () => readSharedPaste("burn", { reveal: true })),
    )

    expect(reads.filter((read) => read.status === "ok")).toHaveLength(1)
    expect(reads.filter((read) => read.status === "missing")).toHaveLength(7)
  })

  test("the owner opening their own burn-after-read paste neither burns nor counts it", async () => {
    signInAs("owner")
    expect(await page("burn")).toBe("content")
    expect(await page("burn")).toBe("content")

    const row = await pasteRow("burn")
    expect(row?.views).toBe(0)
    expect(row?.deletedAt).toBeNull()
  })

  test("a burn-after-read paste has no raw route for anyone but its owner", async () => {
    for (const viewer of [null, "other"]) {
      signInAs(viewer)
      const response = await rawRequest("burnraw")
      expect(response.status).toBe(403)
      expect(await response.text()).not.toContain(marker("burnraw"))
    }

    // Asking for it raw did not use it up.
    expect((await pasteRow("burnraw"))?.deletedAt).toBeNull()
    signInAs(null)
    expect(await reveal("burnraw")).toBe("content")
  })

  test("a burned paste has no raw route either", async () => {
    await reveal("burnraw")
    const response = await rawRequest("burnraw")
    expect(response.status).toBe(404)
    expect(await response.text()).not.toContain(marker("burnraw"))
  })

  test("simultaneous views of an ordinary paste are all counted", async () => {
    await Promise.all(Array.from({ length: 8 }, () => page("plain")))

    expect((await pasteRow("plain"))?.views).toBe(8)
    expect(await viewDayTotal("plain")).toBe(8)
    expect((await pasteRow("plain"))?.deletedAt).toBeNull()
  })

  test("an expired paste is not counted", async () => {
    await seedPaste({
      slug: "old",
      owner: "owner",
      visibility: "public",
      expiresAt: new Date(Date.now() - 1000),
    })

    expect(await page("old")).toBe("404")
    expect((await pasteRow("old"))?.views).toBe(0)
  })

  describe("allow raw access", () => {
    beforeEach(async () => {
      await seedPaste({ slug: "noraw", owner: "owner", visibility: "unlisted", allowRaw: false })
      await seedPaste({ slug: "raw", owner: "owner", visibility: "unlisted", allowRaw: true })
    })

    test("when off, anonymous and other signed-in readers get 403 and no content", async () => {
      for (const viewer of [null, "other"]) {
        signInAs(viewer)
        const response = await rawRequest("noraw")
        expect(response.status).toBe(403)
        expect(await response.text()).not.toContain(marker("noraw"))
      }
    })

    test("when off, the owner can still download their own paste", async () => {
      signInAs("owner")
      const response = await rawRequest("noraw")
      expect(response.status).toBe(200)
      expect(await response.text()).toBe(marker("noraw"))
    })

    test("when on, everyone can", async () => {
      for (const viewer of [null, "other", "owner"]) {
        signInAs(viewer)
        const response = await rawRequest("raw")
        expect(response.status).toBe(200)
        expect(await response.text()).toBe(marker("raw"))
      }
    })
  })
})
