import { describe, expect, test } from "bun:test"
import {
  captureFromSelection,
  type EditorSelection,
  fileNameFor,
  MAX_TITLE,
  titleFor,
} from "../src/lib/capture"

const selection = (overrides: Partial<EditorSelection> = {}): EditorSelection => ({
  text: "const answer = 42",
  fileName: "auth.ts",
  languageId: "typescript",
  lines: { start: 12, end: 30 },
  ...overrides,
})

describe("fileNameFor", () => {
  test("keeps the name of a saved file", () => {
    expect(fileNameFor(selection())).toBe("auth.ts")
    expect(fileNameFor(selection({ fileName: ".env.example", languageId: "dotenv" }))).toBe(
      ".env.example",
    )
  })

  test("names an unsaved document after its language", () => {
    expect(fileNameFor(selection({ fileName: "", languageId: "typescriptreact" }))).toBe(
      "snippet.tsx",
    )
    expect(fileNameFor(selection({ fileName: "", languageId: "shellscript" }))).toBe("snippet.sh")
    expect(fileNameFor(selection({ fileName: "", languageId: "dockerfile" }))).toBe("Dockerfile")
    expect(fileNameFor(selection({ fileName: "", languageId: "plaintext" }))).toBe("snippet.txt")
  })
})

describe("titleFor", () => {
  test("names the file and the selected lines", () => {
    expect(titleFor(selection())).toBe("auth.ts:12-30")
    expect(titleFor(selection({ lines: { start: 7, end: 7 } }))).toBe("auth.ts:7")
  })

  test("names only the file when the whole file is sent", () => {
    expect(titleFor(selection({ lines: null }))).toBe("auth.ts")
  })

  test("keeps the end of a name too long for a title", () => {
    const title = titleFor(selection({ fileName: `${"a".repeat(200)}.test.ts` }))
    expect(title).toHaveLength(MAX_TITLE)
    expect(title.startsWith("…")).toBe(true)
    expect(title.endsWith(".test.ts:12-30")).toBe(true)
  })
})

describe("captureFromSelection", () => {
  test("sends one file with its line range", () => {
    expect(captureFromSelection(selection(), { visibility: "unlisted" })).toEqual({
      title: "auth.ts:12-30",
      visibility: "unlisted",
      files: [{ name: "auth.ts", content: "const answer = 42", lines: { start: 12, end: 30 } }],
    })
  })

  test("sends no line range for a document that was never saved", () => {
    const capture = captureFromSelection(selection({ fileName: "" }), { visibility: "private" })
    expect(capture.files).toEqual([{ name: "snippet.ts", content: "const answer = 42" }])
    expect(capture.title).toBe("snippet.ts:12-30")
  })

  test("uses the reader's title and collection", () => {
    const capture = captureFromSelection(selection(), {
      visibility: "private",
      title: "  Token check  ",
      collection: "auth-patterns",
    })
    expect(capture).toMatchObject({ title: "Token check", collection: "auth-patterns" })
  })

  test("falls back to the file's title when the reader clears it", () => {
    const capture = captureFromSelection(selection(), { visibility: "private", title: "  " })
    expect(capture.title).toBe("auth.ts:12-30")
    expect("collection" in capture).toBe(false)
  })
})
