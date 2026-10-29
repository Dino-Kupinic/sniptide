import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { getCapture, updateCapture } from "@/lib/api/pastes"
import { hasDatabase, resetDatabase, seedPaste, seedUser } from "./harness"

const describeDb = hasDatabase ? describe : describe.skip

describeDb("token API paste snapshots", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("ada")
  })

  test("50 concurrent writers receive their own write and readers receive coherent pastes", async () => {
    const { id } = await seedPaste({
      owner: "ada",
      slug: "concurrent-capture",
      title: "version-0",
      content: "version-0",
    })
    let pending = 50
    const writes = Array.from({ length: pending }, (_, index) => {
      const title = `version-${index + 1}`
      return updateCapture("ada", id, {
        title,
        files: [{ name: "version.txt", content: title }],
      })
        .then((paste) => ({ submitted: title, title: paste.title, body: paste.files[0]?.content }))
        .finally(() => pending--)
    })
    const reads = Array.from({ length: 10 }, async () => {
      const observed: { title: string; body: string | undefined }[] = []
      do {
        const paste = await getCapture("ada", id)
        if (!paste) throw new Error("A live paste disappeared during concurrent edits.")
        observed.push({ title: paste.title, body: paste.files[0]?.content })
      } while (pending > 0)
      return observed
    })
    const [written, observed] = await Promise.all([Promise.all(writes), Promise.all(reads)])

    expect({
      mixedWrites: written.filter((paste) => paste.title !== paste.body).length,
      borrowedWrites: written.filter((paste) => paste.submitted !== paste.title).length,
      mixedReads: observed.flat().filter((paste) => paste.title !== paste.body).length,
    }).toEqual({ mixedWrites: 0, borrowedWrites: 0, mixedReads: 0 })
    expect(observed.flat().length).toBeGreaterThanOrEqual(10)
    const final = await getCapture("ada", id)
    expect(final?.title).toBe(final?.files[0]?.content)
  }, 30_000)
})
