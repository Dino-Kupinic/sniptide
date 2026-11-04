import { expect } from "e2e"
import { test } from "./fixtures"

test("a new account sees the agent setup and a one-line empty state", async ({
  app,
  browser,
  screen,
}) => {
  await app.open("/dashboard")
  await expect(screen.getByRole("heading", "Connect an agent")).toBeVisible()
  await expect(screen.getByText(/^claude mcp add --transport http sniptide /)).toBeVisible()
  await expect(screen.getByText(/^Pastes you and your agents create show up here\./)).toBeVisible()
  await expect(screen.getByRole("tablist", "Filter recent pastes")).toHaveCount(0)
  // Figures and the chart moved to Analytics.
  await expect(screen.getByRole("radio", "7 days")).toHaveCount(0)
  await app.screenshot("dashboard-new-account")

  await screen.getByRole("button", "Hide agent setup").tap()
  await expect(screen.getByRole("heading", "Connect an agent")).toHaveCount(0)
  await app.open("/dashboard")
  await expect(screen.getByRole("button", "Connect an agent")).toBeVisible()
  await screen.getByRole("button", "Connect an agent").tap()
  await expect(screen.getByRole("heading", "Connect an agent")).toBeVisible()

  await screen.getByRole("link", "New paste", { visible: true }).first().tap()
  await expect(browser).toHaveURL(/\/new$/)
})

test("the dashboard fits a phone without horizontal scrolling", async ({
  app,
  browser,
  screen,
}) => {
  await browser.setViewport({ width: 360, height: 780 })
  await app.open("/dashboard")
  await expect(screen.getByRole("heading", "Connect an agent")).toBeVisible()
  expect(
    await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true)
  await app.screenshot("dashboard-phone")
})
