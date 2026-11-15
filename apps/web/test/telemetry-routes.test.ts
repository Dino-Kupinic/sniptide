import { expect, test } from "bun:test"
import { requestLogMode, routeName } from "@/lib/telemetry"

test("names token API and MCP routes without ids, slugs or query strings", () => {
  expect(routeName("/api/mcp")).toBe("/api/mcp")
  expect(routeName("/api/v1/pastes?q=retry&limit=5")).toBe("/api/v1/pastes")
  expect(routeName("/api/v1/pastes/4f9c2d1e-0000-4000-8000-000000000000")).toBe(
    "/api/v1/pastes/[id]",
  )
  expect(routeName("/api/v1/collections/notes/pastes?cursor=abc")).toBe(
    "/api/v1/collections/[slug]/pastes",
  )
  expect(routeName("/api/v1/env/production")).toBe("/api/v1/env/[group]")
  expect(routeName("/api/oauth/token")).toBe("/api/oauth/token")
  expect(routeName("/api/analytics/static/array.js")).toBe("/api/analytics/[...path]")
})

test("groups unknown API paths under one name", () => {
  expect(routeName("/api/v1/pastes/a/b/c")).toBe("/api/*")
  expect(routeName("/api/wp-login.php")).toBe("/api/*")
})

test("keeps the names of pages and probes", () => {
  expect(routeName("/api/health")).toBe("/api/health")
  expect(routeName("/api/auth/sign-in/email")).toBe("/api/auth/[...all]")
  expect(routeName("/api/jobs/purge")).toBe("/api/jobs/[name]")
  expect(routeName("/pastes/abc/edit")).toBe("/pastes/[slug]/edit")
  expect(routeName("/some-slug/raw?file=a.ts")).toBe("/[slug]/raw")
  expect(routeName("/some-slug")).toBe("/[slug]")
})

test("REQUEST_LOG accepts all, errors and off, and refuses anything else", () => {
  const before = process.env.REQUEST_LOG
  try {
    delete process.env.REQUEST_LOG
    expect(requestLogMode()).toBe("all")
    process.env.REQUEST_LOG = " Errors "
    expect(requestLogMode()).toBe("errors")
    process.env.REQUEST_LOG = "off"
    expect(requestLogMode()).toBe("off")
    process.env.REQUEST_LOG = "quiet"
    expect(() => requestLogMode()).toThrow("REQUEST_LOG must be all, errors or off")
  } finally {
    if (before === undefined) delete process.env.REQUEST_LOG
    else process.env.REQUEST_LOG = before
  }
})
