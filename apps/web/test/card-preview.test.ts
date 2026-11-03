import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { cardPreviews } from "@/lib/pastes/card-preview"
import { parsePasteListQuery } from "@/lib/pastes/list-query"
import { listPastePage } from "@/lib/pastes/lists"
import { hasDatabase, resetDatabase, seedPaste, seedUser, signInAs } from "./harness"

// The grid view's cards show the first lines of each paste's code.

const describeDb = hasDatabase ? describe : describe.skip

const text = (lines: Awaited<ReturnType<typeof cardPreviews>>[string] | undefined) =>
  lines?.map((tokens) =>
    tokens.map((token) => (typeof token === "string" ? token : token[0])).join(""),
  )

describeDb("card previews", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("ada")
    signInAs("ada")
  })

  test("a card gets the first lines of the first file, highlighted", async () => {
    const content = Array.from({ length: 20 }, (_, i) => `const line${i + 1} = ${i + 1}`).join("\n")
    await seedPaste({ slug: "code", owner: "ada", language: "typescript", content })
    await seedPaste({ slug: "short", owner: "ada", content: "one line" })
    const { pastes } = await listPastePage({ mode: "mine" }, parsePasteListQuery({}))

    const previews = await cardPreviews(pastes)
    expect(text(previews.code)).toEqual([
      "const line1 = 1",
      "const line2 = 2",
      "const line3 = 3",
      "const line4 = 4",
      "const line5 = 5",
      "const line6 = 6",
    ])
    expect(previews.code?.[0]?.some((token) => typeof token !== "string")).toBe(true)
    expect(text(previews.short)).toEqual(["one line"])
  })

  test("someone else's password-protected paste shows no code", async () => {
    await seedPaste({ slug: "mine", owner: "ada", password: "hunter2" })
    const { pastes } = await listPastePage({ mode: "mine" }, parsePasteListQuery({}))
    const [own] = pastes
    if (!own) throw new Error("no paste")

    expect(Object.keys(await cardPreviews([own]))).toEqual(["mine"])
    const theirs = { ...own, owner: { username: "bob", name: "Bob", initials: "B", tone: "ink" } }
    expect(await cardPreviews([theirs as typeof own])).toEqual({})
  })
})
