import { expect, test } from "bun:test"
import { PgDialect } from "drizzle-orm/pg-core"
import { matchesQuery } from "@/lib/api/pastes"

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
