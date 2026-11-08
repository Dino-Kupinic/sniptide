import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { readdirSync } from "node:fs"
import path from "node:path"
import { isValidUsername, RESERVED_USERNAMES, USERNAME_PATTERN } from "@workspace/auth/username"
import { NextRequest } from "next/server"
import { getPaste, moveCustomLinks } from "@/lib/pastes/store"
import { proxy } from "@/proxy"
import { hasDatabase, resetDatabase, seedPaste, seedUser, signInAs } from "./harness"

// Top-level folders Next.js serves as their own path, from the app and from public/.
function topLevelRoutes() {
  const app = path.join(import.meta.dir, "../app")
  const pages = readdirSync(app, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !/^[([]/.test(entry.name))
    .map((entry) => decodeURIComponent(entry.name))
  const assets = readdirSync(path.join(import.meta.dir, "../public"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
  // Names a username can't spell anyway, such as .well-known, need no reservation.
  return [...pages, ...assets].filter((name) => USERNAME_PATTERN.test(name))
}

function rewrite(url: string) {
  return proxy(new NextRequest(`https://sniptide.com${url}`)).headers.get("x-middleware-rewrite")
}

test("every top-level route is a reserved username", () => {
  const missing = topLevelRoutes().filter((name) => !RESERVED_USERNAMES.has(name))
  expect(missing).toEqual([])
  expect(isValidUsername("dashboard")).toBe(false)
  expect(isValidUsername("sniptide")).toBe(false)
  expect(isValidUsername("dino")).toBe(true)
})

test("the proxy serves /<handle>/<name> and its sub-pages from the internal route", () => {
  expect(rewrite("/dino/deploy")).toBe("https://sniptide.com/dino~deploy")
  expect(rewrite("/dino/x")).toBe("https://sniptide.com/dino~x")
  expect(rewrite("/dino/deploy/raw")).toBe("https://sniptide.com/dino~deploy/raw")
  expect(rewrite("/pastes/dino/deploy")).toBe("https://sniptide.com/pastes/dino~deploy")
  expect(rewrite("/pastes/dino/deploy/edit")).toBe("https://sniptide.com/pastes/dino~deploy/edit")
})

test("the proxy leaves generated links, app routes and assets alone", () => {
  for (const url of [
    "/Ab3xY9qr",
    "/Ab3xY9qr/raw",
    "/Ab3xY9qr/embed",
    "/pastes/Ab3xY9qr/edit",
    "/settings/account",
    "/collections/notes",
    "/languages/typescript.svg",
    "/docs/api",
  ]) {
    expect(rewrite(url)).toBeNull()
  }
})

test("the internal route redirects to the public address", () => {
  const response = proxy(new NextRequest("https://sniptide.com/dino~deploy/raw"))
  expect(response.status).toBe(308)
  expect(response.headers.get("location")).toBe("https://sniptide.com/dino/deploy/raw")
})

test("agents asking for markdown get the custom link's paste", () => {
  const response = proxy(
    new NextRequest("https://sniptide.com/dino/deploy", { headers: { accept: "text/markdown" } }),
  )
  expect(response.headers.get("x-middleware-rewrite")).toBe(
    "https://sniptide.com/api/agent-share/dino/deploy",
  )
})

const describeDb = hasDatabase ? describe : describe.skip
describeDb("handle changes", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
    await seedUser("other")
    signInAs("owner")
  })

  test("move the owner's custom links to the new handle and nothing else", async () => {
    await seedPaste({ slug: "old_name/notes", owner: "owner" })
    await seedPaste({ slug: "oldXname/notes", owner: "owner" })
    await seedPaste({ slug: "Ab3xY9qr", owner: "owner" })
    await seedPaste({ slug: "old_name/theirs", owner: "other" })

    expect(await moveCustomLinks("owner", "old_name", "new")).toBe(1)
    expect(await getPaste("new/notes")).not.toBeNull()
    expect(await getPaste("old_name/notes")).toBeNull()
    expect(await getPaste("oldXname/notes")).not.toBeNull()
    expect(await getPaste("Ab3xY9qr")).not.toBeNull()
    signInAs("other")
    expect(await getPaste("old_name/theirs")).not.toBeNull()
  })
})
