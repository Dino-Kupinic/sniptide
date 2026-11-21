import { test as anonymousTest } from "@e2e-dev/web"
import { credentials, expect, secrets } from "e2e"
import { test } from "./fixtures"

anonymousTest(
  "anonymous visitors write in the editor and sign in to share, while app pages ask to sign in",
  async ({ app, browser, screen }) => {
    await app.open("/new?template=agents-md")
    await expect(browser).toHaveURL("/new?template=agents-md")
    await expect(screen.getByRole("button", /^Sign in to share/, { visible: true })).toBeVisible()
    await app.open("/dashboard")
    await expect(browser).toHaveURL("/sign-in")
  },
)

anonymousTest(
  "a guest's paste is created with its settings after they create an account",
  async ({ app, browser, screen }) => {
    await app.open("/new")
    await screen.getByLabel("Title").fill("Guest paste")
    await screen.getByLabel("Contents of untitled.txt").fill("console.log('hi')")
    await screen.getByRole("radio", "Public").tap()
    await screen
      .getByRole("button", /^Sign in to share/, { visible: true })
      .first()
      .tap()
    await screen.getByRole("link", "Create an account").tap()
    await expect(browser).toHaveURL("/sign-up?next=%2Fnew%3Fclaim%3D1")
    const name = `guest${Date.now() % 1_000_000}`
    await screen.getByLabel("Username").fill(name)
    await screen.getByLabel("Email").fill(`${name}@example.test`)
    await screen.getByLabel("Password").fill(credentials.user("tester").password)
    await screen.getByRole("button", "Create account").tap()
    await expect(browser).toHaveURL(/\/pastes\/[A-Za-z0-9]{8}$/)
    await expect(screen.getByRole("heading", "Guest paste")).toBeVisible()
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
