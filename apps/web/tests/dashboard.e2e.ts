import { expect } from "e2e"
import { test } from "./fixtures"

test("a new account starts from the Agents template", async ({ app, browser, screen }) => {
  await app.open("/dashboard")
  await expect(screen.getByRole("heading", "Connect an agent")).toBeVisible()
  await expect(screen.getByText(/^claude mcp add --transport http sniptide /)).toBeVisible()
  await expect(screen.getByRole("heading", "Recent pastes")).toBeVisible()
  await expect(screen.getByText(/^Pastes you and your agents create show up here\./)).toBeVisible()
  await expect(screen.getByRole("tablist", "Filter recent pastes")).toHaveCount(0)
  await expect(screen.getByRole("heading", "Agent activity")).toBeVisible()
  await expect(
    screen.getByText(/^Requests from your agents show up here once one connects/),
  ).toBeVisible()
  await expect(screen.getByRole("heading", "Agent pastes")).toBeVisible()
  // Figures and the chart moved to Analytics.
  await expect(screen.getByRole("radio", "7 days")).toHaveCount(0)
  await app.screenshot("dashboard-new-account")

  await screen.getByRole("link", "New paste", { visible: true }).first().tap()
  await expect(browser).toHaveURL(/\/new$/)
})

test("removing the agent widget can be undone and is saved", async ({ app, screen }) => {
  await app.open("/dashboard")
  await screen.getByRole("button", "Remove Agents from the dashboard").tap()
  await expect(screen.getByRole("heading", "Connect an agent")).toHaveCount(0)
  await expect(screen.getByText("Removed Agents from the dashboard")).toBeVisible()
  await screen.getByRole("button", "Undo").tap()
  await expect(screen.getByRole("heading", "Connect an agent")).toBeVisible()

  await screen.getByRole("button", "Remove Agents from the dashboard").tap()
  await expect(screen.getByRole("heading", "Connect an agent")).toHaveCount(0)
  await expect(screen.getByText("Removed Agents from the dashboard")).toBeVisible()
  await app.open("/dashboard")
  await expect(screen.getByRole("heading", "Recent pastes")).toBeVisible()
  await expect(screen.getByRole("heading", "Connect an agent")).toHaveCount(0)
})

test("customizing adds, reorders and clears widgets, and templates fill it again", async ({
  app,
  browser,
  screen,
}) => {
  await app.open("/dashboard")
  await screen.getByRole("button", "Customize").tap()
  await expect(screen.getByRole("button", "Move Agents")).toBeVisible()

  await screen.getByRole("button", "Add widget").tap()
  await screen.getByRole("menuitem", "Secrets").tap()
  await expect(screen.getByRole("heading", "Secrets")).toBeVisible()
  await expect(screen.getByText(/^No secret groups yet\./)).toBeVisible()

  const order = () =>
    browser.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("[data-widget]")].map(
        (node) => node.dataset.widget ?? "",
      ),
    )
  await expect
    .poll(order)
    .toEqual(["agents", "agent_activity", "agent_pastes", "recent_pastes", "secrets"])
  // The drag handle works from the keyboard: pick up, move one place up, drop.
  const handle = screen.getByRole("button", "Move Secrets")
  await handle.focus()
  await handle.press("Space")
  await handle.press("ArrowUp")
  await handle.press("Space")
  await expect
    .poll(order)
    .toEqual(["agents", "agent_activity", "agent_pastes", "secrets", "recent_pastes"])
  await app.screenshot("dashboard-customize")

  await screen.getByRole("button", "Templates").tap()
  await screen.getByRole("menuitem", "Blank").tap()
  await expect(screen.getByText(/^Your dashboard is empty\./)).toBeVisible()
  await screen.getByRole("button", "Done").tap()

  await app.open("/dashboard")
  await expect(screen.getByText(/^Your dashboard is empty\./)).toBeVisible()
  await screen.getByRole("button", "Sharing").tap()
  await expect(screen.getByRole("heading", "Most viewed")).toBeVisible()
  await expect(screen.getByRole("heading", "Expiring soon")).toBeVisible()
  await expect.poll(order).toEqual(["recent_pastes", "popular", "expiring"])
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
  await screen.getByRole("button", "Customize").tap()
  await expect(screen.getByRole("button", "Move Agents")).toBeVisible()
  expect(
    await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true)
  await app.screenshot("dashboard-phone-customize")
})
