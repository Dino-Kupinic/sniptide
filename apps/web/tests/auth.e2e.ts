import { test as anonymousTest } from "@e2e-dev/web"
import { credentials, expect, secrets } from "e2e"
import { test } from "./fixtures"

anonymousTest(
  "anonymous visitors must sign in to open the editor",
  async ({ app, browser, screen }) => {
    await app.open("/new")
    await expect(browser).toHaveURL("/sign-in")
    await expect(screen.getByRole("button", "Sign in")).toBeVisible()
  },
)

test("sign-in rejects the wrong password and opens the dashboard with the right one", async ({
  account,
  app,
  browser,
  screen,
}) => {
  await app.clearState()
  await app.open("/sign-in")
  await screen.getByLabel("Email").fill(account.email)
  await screen.getByLabel("Password").fill(secrets.get("wrongPassword"))
  await screen.getByRole("button", "Sign in").tap()
  await expect(
    screen.getByRole("alert").filter({ hasText: "don't match an account" }),
  ).toBeVisible()
  await expect(browser).toHaveURL("/sign-in")
  await screen.getByLabel("Password").fill(credentials.user("tester").password)
  await screen.getByRole("button", "Sign in").tap()
  await expect(browser).toHaveURL("/dashboard")
  await app.open("/new")
  await expect(screen.getByLabel("Title")).toBeVisible()
})

anonymousTest(
  "a pending signup offers email verification and a resend instead of opening the dashboard",
  async ({ app, browser, screen }) => {
    await browser.route("**/api/auth/sign-up/email", async (route) => {
      await route.fulfill({ json: { token: null, user: { email: "pending@example.test" } } })
    })
    await browser.route("**/api/auth/send-verification-email", async (route) => {
      await route.fulfill({ json: { status: true } })
    })
    await app.open("/sign-up")
    await screen.getByLabel("Username").fill(`pending-${Date.now()}`)
    await screen.getByLabel("Email").fill("pending@example.test")
    await screen.getByLabel("Password", { exact: true }).fill(credentials.user("tester").password)
    await screen.getByRole("button", "Create account").tap()
    await expect(screen.getByRole("status")).toContainText("Check pending@example.test")
    await expect(browser).toHaveURL("/sign-up")
    await screen.getByRole("button", "Resend verification email").tap()
    await expect(screen.getByRole("status")).toContainText("a new link is on its way")
  },
)

anonymousTest(
  "an unverified sign-in can recover a missing verification email",
  async ({ app, browser, screen }) => {
    await browser.route("**/api/auth/sign-in/email", async (route) => {
      await route.fulfill({
        status: 403,
        json: { code: "EMAIL_NOT_VERIFIED", message: "Verify your email before signing in." },
      })
    })
    await browser.route("**/api/auth/send-verification-email", async (route) => {
      await route.fulfill({ json: { status: true } })
    })
    await app.open("/sign-in")
    await screen.getByLabel("Email").fill("pending@example.test")
    await screen.getByLabel("Password").fill(credentials.user("tester").password)
    await screen.getByRole("button", "Sign in").tap()
    await expect(screen.getByRole("status")).toContainText("Check pending@example.test")
    await screen.getByRole("button", "Resend verification email").tap()
    await expect(screen.getByRole("status")).toContainText("a new link is on its way")
  },
)
