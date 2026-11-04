import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { paste, user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { NextRequest } from "next/server"
import ProfilePage, { generateMetadata } from "@/app/%5Fprofile/[handle]/page"
import { getDb } from "@/lib/db"
import { DEMO_USER_ID } from "@/lib/demo/guest"
import { readSharedPaste } from "@/lib/pastes/store"
import { profilePath } from "@/lib/profile-path"
import { PROFILE_PAGE_SIZE, readProfile } from "@/lib/profiles"
import { proxy } from "@/proxy"
import { hasDatabase, resetDatabase, seedPaste, seedUser } from "./harness"

const describeDb = hasDatabase ? describe : describe.skip

test("profile links use the lowercase handle", () => {
  expect(profilePath("Dino")).toBe("/@dino")
  expect(profilePath("@Dino_K")).toBe("/@dino_k")
})

test("the proxy serves /@handle from the profile page and keeps /_profile internal", () => {
  for (const path of ["/@dino", "/@Dino", "/%40dino"]) {
    const response = proxy(new NextRequest(`https://sniptide.com${path}`))
    expect(new URL(response.headers.get("x-middleware-rewrite") ?? "").pathname).toMatch(
      /^\/_profile\/(dino|Dino)$/,
    )
  }
  // Agents asking for Markdown get the same page instead of the share-link Markdown route.
  const markdown = proxy(
    new NextRequest("https://sniptide.com/@dino", { headers: { accept: "text/markdown" } }),
  )
  expect(new URL(markdown.headers.get("x-middleware-rewrite") ?? "").pathname).toBe(
    "/_profile/dino",
  )
  const internal = proxy(new NextRequest("https://sniptide.com/_profile/dino"))
  expect(internal.status).toBe(308)
  expect(new URL(internal.headers.get("location") ?? "").pathname).toBe("/@dino")
  // Deeper paths are not profiles.
  expect(
    proxy(new NextRequest("https://sniptide.com/@dino/raw")).headers.has("x-middleware-rewrite"),
  ).toBe(false)
})

async function seedAccount(id: string, username: string | null, fields = {}) {
  await seedUser(id)
  await getDb()
    .update(user)
    .set({ username, displayUsername: username, ...fields })
    .where(eq(user.id, id))
}

async function age(slug: string, minutesAgo: number) {
  await getDb()
    .update(paste)
    .set({ createdAt: new Date(Date.now() - minutesAgo * 60_000) })
    .where(eq(paste.slug, slug))
}

async function rejects(promise: Promise<unknown>, digest: string) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  )
  expect((error as { digest?: string } | null)?.digest).toContain(digest)
}

describeDb("public profiles", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedAccount("dino", "dino")
    await getDb().update(user).set({ displayUsername: "Dino" }).where(eq(user.id, "dino"))
    await seedPaste({ slug: "pub-old", owner: "dino", visibility: "public" })
    await seedPaste({ slug: "pub-new", owner: "dino", visibility: "public" })
    await age("pub-old", 60)
    await age("pub-new", 1)
    await seedPaste({ slug: "unl", owner: "dino", visibility: "unlisted" })
    await seedPaste({ slug: "priv", owner: "dino", visibility: "private" })
    await seedPaste({ slug: "pw", owner: "dino", visibility: "public", password: "hunter22" })
    await seedPaste({ slug: "burn", owner: "dino", visibility: "public", burnAfterRead: true })
    await seedPaste({
      slug: "old",
      owner: "dino",
      visibility: "public",
      expiresAt: new Date(Date.now() - 1000),
    })
    await seedPaste({ slug: "bin", owner: "dino", visibility: "public", deletedAt: new Date() })
    for (const [slug, state] of [
      ["held", "quarantined"],
      ["gone", "removed"],
      ["queued", "pending"],
    ] as const) {
      await seedPaste({ slug, owner: "dino", visibility: "public" })
      await getDb().update(paste).set({ moderationState: state }).where(eq(paste.slug, slug))
    }
  })

  test("lists only live, allowed public pastes, newest first", async () => {
    const profile = await readProfile("dino")
    expect(profile?.pastes.map((row) => row.slug)).toEqual(["pub-new", "pub-old"])
    expect(profile).toMatchObject({
      username: "dino",
      displayUsername: "Dino",
      name: "dino",
      total: 2,
      page: 1,
      pageCount: 1,
    })
  })

  test("a shared paste names its author's handle, so the page can link the profile", async () => {
    await seedAccount("nameless", null)
    await seedPaste({ slug: "anon", owner: "nameless", visibility: "public" })
    const read = await readSharedPaste("pub-new")
    expect(read.status === "ok" && read.paste.author).toMatchObject({
      username: "Dino",
      handle: "dino",
    })
    const anon = await readSharedPaste("anon")
    expect(anon.status === "ok" && anon.paste.author.handle).toBeNull()
  })

  test("searches titles and links, filters by language, and counts a year of activity", async () => {
    await seedPaste({ slug: "hook", owner: "dino", visibility: "public", title: "React 100% hook" })
    await seedPaste({ slug: "rusty", owner: "dino", visibility: "public", language: "rust" })
    await seedPaste({ slug: "ancient", owner: "dino", visibility: "public" })
    await age("ancient", 60 * 24 * 400)

    const search = await readProfile("dino", { q: "100%" })
    expect(search?.pastes.map((row) => row.slug)).toEqual(["hook"])
    expect(search).toMatchObject({ total: 1, totalAll: 5, q: "100%" })
    expect((await readProfile("dino", { q: "PUB-" }))?.pastes.map((row) => row.slug)).toEqual([
      "pub-new",
      "pub-old",
    ])
    // A bare wildcard is literal text, not "everything".
    expect((await readProfile("dino", { q: "_" }))?.total).toBe(0)

    const rust = await readProfile("dino", { language: "rust" })
    expect(rust?.pastes.map((row) => row.slug)).toEqual(["rusty"])
    expect(rust?.languages).toEqual(["rust", "text"])

    // Withheld, private and other hidden pastes never reach the grid either.
    const activity = (await readProfile("dino"))?.activity ?? {}
    expect(Object.values(activity).reduce((sum, value) => sum + value, 0)).toBe(4)
  })

  test("matches handles without regard to case", async () => {
    expect((await readProfile("DINO"))?.username).toBe("dino")
    expect((await readProfile("Dino"))?.username).toBe("dino")
  })

  test("unknown, invalid, invitation-only and demo handles have no profile", async () => {
    await seedAccount("invited", "invited", { pendingInvitation: true })
    await seedAccount(DEMO_USER_ID, "guest")
    await seedAccount("nameless", null)
    for (const handle of ["nobody", "no", "bad handle", "invited", "guest", ""])
      expect(await readProfile(handle)).toBeNull()
  })

  test("pages through the pastes and refuses pages past the last", async () => {
    for (let index = 0; index < PROFILE_PAGE_SIZE; index++) {
      await seedPaste({ slug: `bulk-${index}`, owner: "dino", visibility: "public" })
      await age(`bulk-${index}`, 120 + index)
    }
    const first = await readProfile("dino", { page: 1 })
    const second = await readProfile("dino", { page: 2 })
    expect(first?.pastes).toHaveLength(PROFILE_PAGE_SIZE)
    expect(first?.pageCount).toBe(2)
    expect(second?.pastes.map((row) => row.slug)).toEqual(["bulk-18", "bulk-19"])
    expect(await readProfile("dino", { page: 3 })).toBeNull()
    expect(await readProfile("dino", { page: 0 })).toBeNull()
  })

  test("the page 404s for unknown handles and redirects other spellings to the canonical one", async () => {
    const props = (handle: string, page?: string) =>
      ({
        params: Promise.resolve({ handle }),
        searchParams: Promise.resolve(page ? { page } : {}),
      }) as Parameters<typeof ProfilePage>[0]
    await rejects(ProfilePage(props("nobody")), "404")
    await rejects(ProfilePage(props("dino", "abc")), "404")
    await rejects(ProfilePage(props("dino", "2")), "404")
    await rejects(ProfilePage(props("Dino")), "/@dino")

    const metadata = await generateMetadata(props("dino"))
    expect(metadata.title).toBe("dino (@Dino) · Sniptide")
    expect(String(metadata.alternates?.canonical)).toEndWith("/@dino")
    expect(metadata.robots).toEqual({ index: false, follow: true })
    expect((await generateMetadata(props("nobody"))).robots).toEqual({
      index: false,
      follow: false,
    })
  })
})
