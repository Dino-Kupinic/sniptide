import { expect, test } from "bun:test"
import { PgDialect } from "drizzle-orm/pg-core"
import { lineAround, matchesQuery } from "@/lib/pastes/search"

// A file check without `offset 0` lets PostgreSQL answer it with one scan of every account's
// files. The load suite measures the difference; this pins the clause that makes it.
test("search checks files with one fenced probe per word", () => {
  const condition = matchesQuery("retry  with Backoff retry")
  if (!condition) throw new Error("Expected a search condition.")
  const { sql, params } = new PgDialect().sqlToQuery(condition)
  expect(sql.match(/offset 0\)/g)).toHaveLength(3)
  expect(sql.match(/from "paste_file" f/g)).toHaveLength(3)
  expect(params).toContain("%backoff%")
})

test("a match shows its line without indentation, cut around the word when long", () => {
  expect(lineAround("a\n    const retryFetch = 1\nb", "retryfetch")).toBe("const retryFetch = 1")
  const long = `${"x".repeat(100)} retryFetch ${"y".repeat(100)}`
  const excerpt = lineAround(long, "retryfetch") ?? ""
  expect(excerpt.startsWith("…") && excerpt.endsWith("…")).toBe(true)
  expect(excerpt).toContain("retryFetch")
  expect(excerpt.length).toBe(82)
  // The excerpt starts just before the match, so a narrow row still shows it.
  expect(
    lineAround("const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))", "settimeout"),
  ).toBe("…=> setTimeout(r, ms))")
  // A window that starts or ends inside the file marks the line as cut on that side.
  expect(lineAround("Fetch(url)", "fetch", true, true)).toBe("…Fetch(url)…")
  expect(lineAround("no match here", "fetch")).toBeNull()
})
