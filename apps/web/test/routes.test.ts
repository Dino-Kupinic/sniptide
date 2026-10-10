import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import NewPage from "@/app/(app)/new/page"
import {
  default as EditPage,
  generateMetadata as editMetadata,
} from "@/app/(app)/pastes/[slug]/edit/page"
import {
  default as DetailPage,
  generateMetadata as detailMetadata,
} from "@/app/(app)/pastes/[slug]/page"
import { GET as raw } from "@/app/[slug]/raw/route"
import { hasDatabase, marker, resetDatabase, seedPaste, seedUser, signInAs } from "./harness"

// The pages and routes themselves. A redirect or a streamed page can carry a paste's content
// even when it looks denied, so these look at everything a request would send: the rendered
// tree, the metadata, and response bodies.

const describeDb = hasDatabase ? describe : describe.skip

// Whether the paste's body or title appears anywhere in `value`, rendered trees included.
function leaks(value: unknown, slug: string, seen = new WeakSet<object>()): boolean {
  if (typeof value === "string")
    return value.includes(marker(slug)) || value.includes(`title-of-${slug}`)
  if (typeof value !== "object" || value === null || seen.has(value)) return false
  seen.add(value)
  return Object.values(value).some((child) => leaks(child, slug, seen))
}

async function denied(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  )
  // notFound() throws an error whose digest names the 404.
  expect((error as { digest?: string } | null)?.digest).toContain("404")
}

describeDb("app routes", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
    await seedUser("other")
    await seedPaste({ slug: "priv", owner: "owner", visibility: "private" })
    await seedPaste({ slug: "pw", owner: "owner", password: "hunter22" })
    await seedPaste({ slug: "pub", owner: "owner", visibility: "public" })
  })

  const params = (slug: string) =>
    ({ params: Promise.resolve({ slug }), searchParams: Promise.resolve({}) }) as never

  for (const [who, id] of [
    ["anonymous", null],
    ["another account", "other"],
  ] as const) {
    describe(who, () => {
      beforeEach(() => signInAs(id))

      for (const slug of ["priv", "pw", "pub"]) {
        test(`/pastes/${slug} and its edit page render nothing of it`, async () => {
          await denied(DetailPage(params(slug)))
          await denied(EditPage(params(slug)))
          expect(leaks(await detailMetadata(params(slug)), slug)).toBe(false)
          expect(leaks(await editMetadata(params(slug)), slug)).toBe(false)
        })

        test(`/new?from=${slug} starts from an empty editor`, async () => {
          const page = await NewPage({ searchParams: Promise.resolve({ from: slug }) } as never)
          expect(leaks(page, slug)).toBe(false)
        })
      }

      test("the raw route answers 404 for a private paste without its content", async () => {
        const response = await raw(new Request("http://x/priv/raw"), params("priv"))
        expect(response.status).toBe(404)
        expect(await response.text()).not.toContain(marker("priv"))
      })

      test("the raw route answers 401 for a locked paste without its content", async () => {
        const response = await raw(new Request("http://x/pw/raw"), params("pw"))
        expect(response.status).toBe(401)
        expect(await response.text()).not.toContain(marker("pw"))
      })
    })
  }

  test("the owner still gets their paste in the app and as a duplicate", async () => {
    signInAs("owner")
    const detail = await DetailPage(params("priv"))
    expect(leaks(detail, "priv")).toBe(true)
    expect(
      leaks(await NewPage({ searchParams: Promise.resolve({ from: "priv" }) } as never), "priv"),
    ).toBe(true)
    expect(leaks(await EditPage(params("pw")), "pw")).toBe(true)
  })
})
