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
