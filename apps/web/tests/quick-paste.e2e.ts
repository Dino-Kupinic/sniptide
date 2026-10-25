import { randomUUID } from "node:crypto"
import { createAuth } from "@workspace/auth"
import { createDb } from "@workspace/db"
import { user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { expect } from "e2e"
import { databaseUrl } from "./environment"
import { test } from "./fixtures"

test("quick drafts stay with their account when the browser changes accounts", async ({
  app,
  browser,
  screen,
}) => {
  await app.open("/dashboard")
  const accountCookies = await browser.cookies()
  const code = screen.getByLabel("Code")
  await code.fill("account A private draft")
  await code.press("Control+s")

  const db = createDb(databaseUrl())
  const username = `e2e-${randomUUID().slice(0, 16)}`
  const email = `${username}@example.test`
  try {
    const auth = createAuth({
      db,
      secret: process.env.E2E_AUTH_SECRET ?? "",
      baseURL: app.baseUrl,
      rateLimitEnabled: false,
    })
    const response = await auth.api.signUpEmail({
      body: { name: username, username, email, password: process.env.E2E_ACCOUNT_PASSWORD ?? "" },
      asResponse: true,
    })
    expect(response.status).toBe(200)
    await browser.setCookies(
      response.headers.getSetCookie().map((header) => {
        const pair = header.split(";")[0] ?? ""
        const separator = pair.indexOf("=")
        return {
          url: app.baseUrl ?? "",
          name: pair.slice(0, separator),
          value: pair.slice(separator + 1),
        }
      }),
    )
    await app.open("/dashboard")
    await expect(code).toHaveValue("")
    await code.fill("account B private draft")
    await code.press("Control+s")
    await browser.setCookies(accountCookies)
    await app.open("/dashboard")
    await expect(code).toHaveValue("account A private draft")
  } finally {
    await db.delete(user).where(eq(user.email, email))
    await db.$client.end()
  }
})

test("an unowned legacy quick draft is never adopted by the current account", async ({
  app,
  browser,
  screen,
}) => {
  await app.open("/dashboard")
  await browser.evaluate(() => {
    localStorage.setItem(
      "sniptide:quick-paste",
      JSON.stringify({ content: "unowned browser secret", name: "secret.env" }),
    )
    return null
  })
  await app.open("/dashboard")
  await expect(screen.getByLabel("Code")).toHaveValue("")
})
