import { describe, expect, test } from "bun:test"
import { validateTestDatabaseUrl } from "./database-url"

describe("dedicated test database boundary", () => {
  test.each([
    "postgres://user:password@localhost:5432/sniptide_test",
    "postgresql://user:password@db:5432/sniptide_test?sslmode=require&application_name=tests",
    "postgres://user:password@[::1]:5432/sniptide_test",
  ])("accepts a dedicated PostgreSQL target %s", (value) => {
    expect(validateTestDatabaseUrl(value)).toBe(value)
  })

  test.each([
    "",
    "not-a-url_test",
    "https://localhost/sniptide_test",
    "postgres://localhost/sniptide?application_name=foo_test",
    "postgres://foo_test:password@localhost/sniptide",
    "postgres://localhost/sniptide#foo_test",
    "postgres://localhost/sniptide_test#fragment",
    "postgres://localhost/sniptide_test/other_test",
    "postgres://localhost/%73niptide_test",
    "postgres://localhost/sniptide_test?database=production",
    "postgres://localhost/sniptide_test?dbname=production",
    "postgres://localhost/sniptide_test?host=other",
    "postgres://localhost/sniptide_test?application_name=x%00database%00production",
    "postgres://localhost/sniptide_test?application_name%00database=production",
    "postgres://user%00database%00production@localhost/sniptide_test",
    "postgres://user:password%00value@localhost/sniptide_test",
    "postgres://localhost/sniptide_test?application_name=tests%0Aproduction",
    "postgres://localhost/",
  ])("rejects unsafe or ambiguous target %s", (value) => {
    expect(() => validateTestDatabaseUrl(value)).toThrow("TEST_DATABASE_URL")
  })
})
