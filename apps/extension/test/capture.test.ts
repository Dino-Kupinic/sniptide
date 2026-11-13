import { describe, expect, test } from "bun:test"
import {
  captureFromSelection,
  extensionFromHints,
  fileNameFor,
  MAX_DESCRIPTION,
  MAX_TITLE,
  sourceDescription,
  titleFor,
} from "../src/lib/capture"

describe("extensionFromHints", () => {
  test("reads the language from the class names sites put on code blocks", () => {
    expect(extensionFromHints(["hljs language-typescript"])).toBe("ts")
    expect(extensionFromHints(["lang-py"])).toBe("py")
    expect(extensionFromHints(["highlight highlight-source-rust"])).toBe("rs")
    expect(extensionFromHints(["brush: js"])).toBe("js")
  })

  test("reads a bare language attribute", () => {
    expect(extensionFromHints(["Go"])).toBe("go")
    expect(extensionFromHints(["c++"])).toBe("cpp")
  })

  test("skips hints that name no language and uses the next one", () => {
    expect(extensionFromHints(["language-plaintext", "language-sql"])).toBe("sql")
    expect(extensionFromHints(["prose mx-auto", "", "language-klingon"])).toBeNull()
  })

  test("doesn't mistake an ordinary class for a language", () => {
    expect(extensionFromHints(["go-to-top button"])).toBeNull()
    expect(extensionFromHints(["translang-en"])).toBeNull()
  })
})

describe("fileNameFor", () => {
  test("names the file after the page's language", () => {
    expect(fileNameFor("const a = 1", ["language-ts"])).toBe("snippet.ts")
    expect(fileNameFor("FROM node:24", ["language-dockerfile"])).toBe("Dockerfile")
  })

  test("recognizes JSON without a hint and falls back to plain text", () => {
    expect(fileNameFor(' {"a": [1, 2]} ', [])).toBe("snippet.json")
    expect(fileNameFor("{ not json", [])).toBe("snippet.txt")
    expect(fileNameFor("A sentence from an article.", [])).toBe("snippet.txt")
  })
})

describe("titleFor", () => {
  test("uses the page title on one line", () => {
    expect(titleFor({ title: "  Retry with\n backoff  ", text: "x" })).toBe("Retry with backoff")
  })

  test("clips a long page title to the paste limit", () => {
    const title = titleFor({ title: "a".repeat(300), text: "x" })
    expect(title).toHaveLength(MAX_TITLE)
    expect(title.endsWith("…")).toBe(true)
  })

  test("falls back to the first line with text, then to a fixed name", () => {
    expect(titleFor({ title: "", text: "\n\n  const a = 1\nconst b = 2" })).toBe("const a = 1")
    expect(titleFor({ title: " ", text: " \n " })).toBe("Untitled selection")
  })
})

describe("sourceDescription", () => {
  test("names the page without its fragment or credentials", () => {
    expect(sourceDescription("https://user:pw@example.com/a?b=1#section")).toBe(
      "From https://example.com/a?b=1",
    )
  })

  test("falls back to the origin when the address doesn't fit", () => {
    const description = sourceDescription(`https://example.com/${"a".repeat(400)}`)
    expect(description).toBe("From https://example.com")
    expect(description.length).toBeLessThanOrEqual(MAX_DESCRIPTION)
  })

  test("leaves out pages that aren't on the web", () => {
    expect(sourceDescription("chrome://extensions")).toBe("")
    expect(sourceDescription("file:///home/ada/notes.txt")).toBe("")
    expect(sourceDescription("")).toBe("")
  })
})

describe("captureFromSelection", () => {
  const selection = {
    text: "SELECT 1",
    title: "Queries",
    url: "https://example.com/sql",
    hints: ["language-sql"],
  }

  test("builds a single-file paste with the reader's defaults", () => {
    expect(
      captureFromSelection(selection, { visibility: "unlisted", includeSource: true }),
    ).toEqual({
      title: "Queries",
      description: "From https://example.com/sql",
      visibility: "unlisted",
      files: [{ name: "snippet.sql", content: "SELECT 1" }],
    })
  })

  test("leaves the page out of the description when the reader turned that off", () => {
    const capture = captureFromSelection(selection, { visibility: "private", includeSource: false })
    expect(capture.description).toBe("")
    expect(capture.visibility).toBe("private")
  })
})
