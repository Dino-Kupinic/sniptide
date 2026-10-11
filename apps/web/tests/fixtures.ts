import { randomUUID } from "node:crypto"
import { test as base } from "@e2e-dev/web"
import { createAuth } from "@workspace/auth"
import { createDb } from "@workspace/db"
import { user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { databaseUrl } from "./environment"

// Seed through Better Auth, then install its real session cookie. This keeps screenshots
// available for editor failures and leaves the sign-in UI to its own regression test.
export const test = base.extend<{ account: { email: string } }>({
  account: async ({ app, browser }, use) => {
    const db = createDb(databaseUrl())
    const username = `e2e-${randomUUID().slice(0, 16)}`
    const email = `${username}@example.test`
    const auth = createAuth({
      db,
      secret: process.env.E2E_AUTH_SECRET ?? "",
      baseURL: app.baseUrl,
      rateLimitEnabled: false,
    })
    try {
      const response = await auth.api.signUpEmail({
        body: { name: username, username, email, password: process.env.E2E_ACCOUNT_PASSWORD ?? "" },
        asResponse: true,
      })
      if (!response.ok) throw new Error(`Account fixture failed (${response.status}).`)
      const cookies = response.headers.getSetCookie().map((header) => {
        const pair = header.split(";")[0] ?? ""
        const separator = pair.indexOf("=")
        return {
          url: app.baseUrl ?? "",
          name: pair.slice(0, separator),
          value: pair.slice(separator + 1),
        }
      })
      if (!cookies.length) throw new Error("Account fixture did not receive a session cookie.")
      await browser.setCookies(cookies)
      await use({ email })
    } finally {
      try {
        // Cascade removes only this attempt's sessions, snippets, and files, even after failure.
        await db.delete(user).where(eq(user.email, email))
      } finally {
        await db.$client.end()
      }
    }
  },
})
