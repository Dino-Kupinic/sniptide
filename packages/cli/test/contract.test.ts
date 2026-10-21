import { describe, expect, test } from "bun:test"
import { bundle, type Capture, capture, codeFile, paste } from "../src/contract"

const file = { name: " a.ts ", language: " typescript ", content: "", lines: { start: 1, end: 1 } }
const input = {
  title: " example ",
  description: "",
  visibility: "private",
  collection: null,
  tags: ["A", "A", ""],
  source: null,
  files: [file],
} satisfies Capture

describe("CLI wire contract", () => {
  test("preserves response values while dropping unknown fields except source metadata", () => {
    const source = { repository: "", commit: "arbitrary", dirty: false, extra: 1 }
    expect(capture({ ...input, source, extra: true })).toEqual({ ...input, source })
    expect(capture({ ...input, source: undefined })).toEqual(input)
    expect(paste({ ...input, id: "id", slug: "slug", url: "ignored" })).toEqual({
      ...input,
      id: "id",
      slug: "slug",
    })
    expect(bundle({ version: 1, pastes: [input], ignored: true })).toEqual({
      version: 1,
      pastes: [input],
    })
  })

  test("requires response metadata without applying request defaults", () => {
    const missingFields: [string, string][] = [
      ["description", "Expected a description string."],
      ["visibility", "Invalid paste visibility."],
      ["tags", "Expected a tags array."],
      ["collection", "Expected a nonempty collection string."],
    ]
    for (const [key, error] of missingFields)
      expect(() => capture({ ...input, [key]: undefined })).toThrow(error)
    expect(() => codeFile({ ...file, language: undefined })).toThrow(
      "Expected a nonempty language string.",
    )
  })

  test("rejects unsafe or reversed ranges and empty files/bundles", () => {
    for (const lines of [
      { start: 0, end: 1 },
      { start: 2, end: 1 },
      { start: 1, end: Number.MAX_SAFE_INTEGER + 1 },
    ])
      expect(() => codeFile({ ...file, lines })).toThrow("Invalid source line range.")
    expect(() => capture({ ...input, files: [] })).toThrow("A paste must contain 1–10 files.")
    expect(() => bundle({ version: 1, pastes: [] })).toThrow(
      "Expected a version 1 Sniptide bundle with pastes.",
    )
  })
})
