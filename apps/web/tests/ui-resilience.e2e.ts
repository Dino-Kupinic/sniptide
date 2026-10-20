import { expect } from "e2e"
import { test } from "./fixtures"

test("production hides the UI stress fixtures", async ({ app }) => {
  test.skip(!process.env.CI, "The development server intentionally exposes these fixtures.")
  const response = await fetch(new URL("/dev/ui-stress/worst/pastes", app.baseUrl))
  expect(response.status).toBe(404)
  expect(await response.text()).not.toContain("Stress dataset")
})

test("a long collection heading and its actions stay usable on a narrow screen", async ({
  app,
  browser,
  screen,
}) => {
  const name = "Benachrichtigungseinstellungen"
  await browser.setViewport({ width: 320, height: 900 })
  await app.open("/collections")
  await screen.getByRole("button", "New collection", { visible: true }).tap()
  await screen.getByLabel("Name").fill(name)
  await screen.getByRole("button", "Create collection").tap()
  await expect(browser).toHaveURL(/\/collections\/[^/]+$/)
  await expect(screen.getByRole("heading", name)).toBeVisible()
  const width = await browser.evaluate(() => ({
    viewport: window.innerWidth,
    content: document.documentElement.scrollWidth,
  }))
  expect(width.content).toBeLessThanOrEqual(width.viewport)

  await app.open("/collections")
  await expect(screen.getByRole("link", name, { visible: true })).toHaveAttribute("title", name)
  await screen.getByRole("button", `Actions for ${name}`, { visible: true }).tap()
  await expect(screen.getByRole("menuitem", "Rename")).toBeVisible()
})
