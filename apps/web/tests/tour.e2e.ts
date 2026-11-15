import { createDb } from "@workspace/db"
import { onboarding, user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { expect } from "e2e"
import { databaseUrl } from "./environment"
import { test } from "./fixtures"

// Test accounts start with the tour seen. This puts one back to a new account's state.
async function tourSeen(email: string, seen: boolean | "read") {
  const db = createDb(databaseUrl())
  try {
    const [account] = await db.select({ id: user.id }).from(user).where(eq(user.email, email))
    if (!account) throw new Error(`No test account for ${email}.`)
    if (seen !== "read") {
      await db
        .update(onboarding)
        .set({ tourSeenAt: seen ? new Date() : null })
        .where(eq(onboarding.userId, account.id))
    }
    const [row] = await db
      .select({ tourSeenAt: onboarding.tourSeenAt })
      .from(onboarding)
      .where(eq(onboarding.userId, account.id))
    return row?.tourSeenAt ?? null
  } finally {
    await db.$client.end()
  }
}

test("a new account gets the tour once and can walk through it", async ({
  account,
  app,
  browser,
  screen,
}) => {
  await tourSeen(account.email, false)
  await app.open("/dashboard")

  const tour = screen.getByRole("dialog")
  await expect(tour.getByRole("heading", "Save a paste")).toBeVisible()
  await expect(tour.getByText("1 of 4")).toBeVisible()
  await expect(tour.getByRole("button", "Next")).toBeFocused()
  await expect(browser.locator("[data-tour-current]")).toHaveAttribute("data-tour", "new-paste")
  await app.screenshot("tour-first-step")

  await tour.getByRole("button", "Next").tap()
  await expect(tour.getByRole("heading", "Find anything")).toBeVisible()
  await expect(browser.locator("[data-tour-current]")).toHaveAttribute("data-tour", "search")
  await tour.getByRole("button", "Next").tap()
  await expect(tour.getByRole("heading", "Group pastes in collections")).toBeVisible()
  await tour.getByRole("button", "Next").tap()
  await expect(tour.getByRole("heading", "Connect your agent")).toBeVisible()
  await expect(tour.getByRole("button", "Skip tour")).toHaveCount(0)
  await tour.getByRole("button", "Done").tap()
  await expect(screen.getByRole("dialog")).toHaveCount(0)
  await expect(browser.locator("[data-tour-current]")).toHaveCount(0)

  expect(await tourSeen(account.email, "read")).not.toBeNull()
  await app.open("/dashboard")
  await expect(screen.getByRole("heading", "Connect an agent")).toBeVisible()
  await expect(screen.getByRole("dialog")).toHaveCount(0)
})

test("Escape and Skip end the tour, and the account menu starts it again", async ({
  account,
  app,
  browser,
  screen,
}) => {
  await tourSeen(account.email, false)
  await app.open("/dashboard")
  await expect(screen.getByRole("heading", "Save a paste")).toBeVisible()
  await browser.keyboard.press("Escape")
  await expect(screen.getByRole("dialog")).toHaveCount(0)

  // From another page the menu item goes to the dashboard first.
  await app.open("/settings")
  await screen.getByRole("button", new RegExp(account.email.split("@")[0] ?? "")).tap()
  await screen.getByRole("menuitem", "Take the tour").tap()
  await expect(browser).toHaveURL(/\/dashboard$/)
  await expect(screen.getByRole("heading", "Save a paste")).toBeVisible()
  await screen.getByRole("dialog").getByRole("button", "Skip tour").tap()
  await expect(screen.getByRole("dialog")).toHaveCount(0)
})

test("leaving the dashboard ends the tour, and a removed widget drops its step", async ({
  account,
  app,
  browser,
  screen,
}) => {
  await app.open("/dashboard")
  await screen.getByRole("button", "Remove Agents from the dashboard").tap()
  await expect(screen.getByRole("heading", "Connect an agent")).toHaveCount(0)

  await tourSeen(account.email, false)
  await app.open("/dashboard")
  const tour = screen.getByRole("dialog")
  await expect(tour.getByText("1 of 3")).toBeVisible()

  // A window narrowed past the sidebar takes the step's target away, which ends the tour.
  await browser.setViewport({ width: 390, height: 844 })
  await expect(screen.getByRole("dialog")).toHaveCount(0)
  await browser.setViewport({ width: 1280, height: 900 })
  await screen.getByRole("button", new RegExp(account.email.split("@")[0] ?? "")).tap()
  await screen.getByRole("menuitem", "Take the tour").tap()
  await expect(tour.getByText("1 of 3")).toBeVisible()

  // The page stays usable beside the tour.
  await screen.getByRole("link", "Analytics", { visible: true }).first().tap()
  await expect(browser).toHaveURL(/\/analytics$/)
  await expect(screen.getByRole("dialog")).toHaveCount(0)
})

test("on a phone the tour points at the tab bar and the top bar", async ({
  account,
  app,
  browser,
  screen,
}) => {
  await browser.setViewport({ width: 390, height: 844 })
  await tourSeen(account.email, false)
  await app.open("/dashboard")

  const tour = screen.getByRole("dialog")
  await expect(tour.getByRole("heading", "Save a paste")).toBeVisible()
  await expect(browser.locator("[data-tour-current]")).toHaveAttribute("data-tour", "new-paste-tab")
  await tour.getByRole("button", "Next").tap()
  await expect(browser.locator("[data-tour-current]")).toHaveAttribute("data-tour", "search-mobile")
  await tour.getByRole("button", "Next").tap()
  await expect(tour.getByText(/^Collections are under More\./)).toBeVisible()
  await expect(browser.locator("[data-tour-current]")).toHaveAttribute("data-tour", "more-tab")
  await app.screenshot("tour-phone-more")
  expect(await browser.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    390,
  )
})
