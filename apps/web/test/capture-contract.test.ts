import { describe, expect, test } from "bun:test"
import { apiReplacementSchema } from "@sniptide/contracts"
import { captureSchema } from "@/lib/api/pastes"

const minimal = { title: " example ", files: [{ name: " x.ts ", content: "" }] }

describe("HTTP capture wire contract", () => {
  test("defaults creation metadata without trimming title or file names", () => {
    expect(captureSchema.parse({ ...minimal, ignored: true })).toEqual({
      ...minimal,
      description: "",
      visibility: "private",
      collection: null,
      tags: [],
      source: null,
    })
  })
  test("keeps omitted replacement metadata absent and explicit clearing values intact", () => {
    expect(apiReplacementSchema.parse(minimal)).toEqual(minimal)
    expect(
      apiReplacementSchema.parse({ ...minimal, collection: null, source: null, tags: [] }),
    ).toEqual({ ...minimal, collection: null, source: null, tags: [] })
  })
  test("normalizes collection, tags and repository, keeps ranges and drops a supplied language", () => {
    const file = { name: "a", content: "", lines: { start: 3, end: 3 } }
    expect(
      captureSchema.parse({
        ...minimal,
        files: [{ ...file, language: "guess" }],
        collection: " ui ",
        tags: [" React ", "react"],
        source: { repository: " git@github.com:org/repo.git ", commit: "abcdef0", dirty: false },
      }),
    ).toEqual({
      title: minimal.title,
      files: [file],
      description: "",
      visibility: "private",
      collection: "ui",
      tags: ["react"],
      source: { repository: "git@github.com:org/repo.git", commit: "abcdef0", dirty: false },
    })
  })
  test("rejects credentials, invalid tag/hash/range and nonnullable metadata", () => {
    for (const override of [
      { source: { repository: "https://user:pass@example.com/repo", commit: null, dirty: false } },
      { tags: ["two words"] },
      { source: { repository: null, commit: "nothex", dirty: false } },
      { files: [{ name: "a", content: "", lines: { start: 2, end: 1 } }] },
      { description: null },
      { visibility: null },
      { tags: null },
    ])
      expect(captureSchema.safeParse({ ...minimal, ...override }).success).toBe(false)
  })
})
