import { randomUUID } from "node:crypto"
import { test as base } from "@e2e-dev/web"
import { createAuth } from "@workspace/auth"
import { createDb } from "@workspace/db"
import { onboarding, user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { expect } from "e2e"
import { databaseUrl } from "./environment"

// A new account goes through the welcome wizard first and then gets the tour. Tests start on a
// plain dashboard, so every test account has already skipped the wizard and seen the tour.
async function skipOnboarding(db: ReturnType<typeof createDb>, email: string) {
  const [created] = await db.select({ id: user.id }).from(user).where(eq(user.email, email))
  if (!created) throw new Error(`No test account for ${email}.`)
  await db
    .insert(onboarding)
    .values({ userId: created.id, source: "skipped", tourSeenAt: new Date() })
}

// A route's screen streams in after the shell and hydrates on its own, so it can show before
// React handles input on it, and a key pressed then is lost. Opening a page therefore waits until
// the loading state is gone and every element shown in the main area belongs to React.
function screenReady() {
  const shown = (element: Element) => element.checkVisibility()
  if ([...document.querySelectorAll("[data-slot=loading] *")].some(shown)) return false
  return [...document.querySelectorAll("main *")]
    .filter(shown)
    .every((element) => Object.keys(element).some((key) => key.startsWith("__reactFiber$")))
}

export const test = base.extend<{ account: { email: string }; hydratedOpen: undefined }>({
  hydratedOpen: async ({ app, browser }, use) => {
    const open = app.open.bind(app)
    app.open = async (path?: string) => {
      await open(path)
      await expect.poll(() => browser.evaluate(screenReady)).toBe(true)
    }
    await use(undefined)
  },
  // Seed through Better Auth, then install its real session cookie. This keeps screenshots
  // available for editor failures and leaves the sign-in UI to its own regression test.
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
      await skipOnboarding(db, email)
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
