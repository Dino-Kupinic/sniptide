import { randomUUID } from "node:crypto"
import { createDb } from "@workspace/db"
import { accountUsage, apiTokenUsageDay, user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { expect } from "e2e"
import { DAY } from "@/lib/time"
import { databaseUrl } from "./environment"
import { test } from "./fixtures"

test("usage shows account totals, daily API history and settings navigation", async ({
  account,
  app,
  browser,
  screen,
}) => {
  const db = createDb(databaseUrl())
  try {
    const [owner] = await db.select({ id: user.id }).from(user).where(eq(user.email, account.email))
    if (!owner) throw new Error("Fixture account is missing.")
    await db
      .update(accountUsage)
      .set({ storageBytes: 80 * 1024 * 1024, pasteCount: 1000, collectionCount: 3, fileCount: 4 })
      .where(eq(accountUsage.ownerId, owner.id))
    const day = Math.floor(Date.now() / DAY)
    const previousDays = Array.from({ length: 29 }, (_, offset) => ({
      ownerId: owner.id,
      tokenId: randomUUID(),
      day: day - offset - 1,
      requests: offset % 6 === 0 ? 0 : (offset % 7) * 3 + 4,
    }))
    await db
      .insert(apiTokenUsageDay)
      .values([
        ...previousDays,
        { ownerId: owner.id, tokenId: randomUUID(), day, requests: 5 },
        { ownerId: owner.id, tokenId: randomUUID(), day, requests: 7 },
      ])
    await app.open("/settings?tab=usage")
    await expect(screen.getByRole("tab", "Usage")).toHaveAttribute("aria-selected", "true")
    await expect(screen.getByText("80.0 MB of 100.0 MB")).toBeVisible()
    await expect(screen.getByText("1,000 of 1,000")).toBeVisible()
    await expect(screen.getByText("Approaching limit")).toBeVisible()
    await expect(screen.getByText("Limit reached")).toBeVisible()
    await expect(screen.getByRole("progressbar", "Storage")).toHaveAttribute("aria-valuenow", "80")
    await expect(screen.getByRole("progressbar", "Pastes")).toHaveAttribute("aria-valuenow", "100")
    const total = 12 + previousDays.reduce((sum, row) => sum + row.requests, 0)
    await expect(
      screen.getByText(total.toLocaleString("en"), { exact: true, visible: true }),
    ).toBeVisible()
    await screen.getByText("View daily values").tap()
    await expect(screen.getByRole("table")).toBeVisible()
    await expect(screen.getByRole("table").getByRole("row")).toHaveCount(31)
    await expect(screen.getByRole("table").getByRole("row").last()).toContainText("12")
    await screen.getByText("View daily values").tap()
    await app.screenshot("usage-desktop-populated")
    await screen.getByRole("tab", "Billing").tap()
    await screen.getByRole("tab", "Usage").tap()
    await expect(browser).toHaveURL("/settings?tab=usage")
    await browser.setViewport({ width: 390, height: 844 })
    await browser.reload()
    await expect(screen.getByRole("heading", "Usage", { level: 1 })).toBeVisible()
    expect(
      await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await app.screenshot("usage-mobile-populated")
    await screen.getByRole("button", "Back to settings").tap()
    await screen.getByRole("link", "Usage").tap()
    await expect(browser).toHaveURL("/settings?tab=usage")
    await app.back()
    await expect(browser).toHaveURL("/settings")
  } finally {
    await db.$client.end()
  }
})

test("an empty account still shows its usage and an empty history", async ({
  account,
  app,
  screen,
}) => {
  void account
  await app.open("/settings?tab=usage")
  await expect(
    screen.getByText("No API requests in the last 30 days.", { visible: true }),
  ).toBeVisible()
  await expect(screen.getByText("Storage", { exact: true })).toBeVisible()
  await app.screenshot("usage-empty")
})

test("usage streams a loading state while the account read is pending", async ({
  account,
  app,
  browser,
  screen,
}) => {
  void account
  const db = createDb(databaseUrl())
  let navigation: ReturnType<typeof browser.reload> | undefined
  try {
    await app.open("/settings?tab=usage")
    await db.$client.begin(async (tx) => {
      await tx.unsafe("LOCK TABLE account_usage IN ACCESS EXCLUSIVE MODE")
      navigation = browser.reload()
      await expect(screen.getByRole("status").filter({ hasText: "Loading usage" })).toBeVisible()
      await app.screenshot("usage-loading")
    })
    await navigation
    await expect(
      screen.getByText("No API requests in the last 30 days.", { visible: true }),
    ).toBeVisible()
  } finally {
    try {
      await navigation
    } finally {
      await db.$client.end()
    }
  }
})

test("usage read failures show a reload action and recover", async ({
  account,
  app,
  browser,
  screen,
}) => {
  const db = createDb(databaseUrl())
  try {
    const [owner] = await db.select({ id: user.id }).from(user).where(eq(user.email, account.email))
    if (!owner) throw new Error("Fixture account is missing.")
    await db.delete(accountUsage).where(eq(accountUsage.ownerId, owner.id))
    await app.open("/settings?tab=usage")
    await expect(
      screen.getByRole("alert").filter({ hasText: "Usage is unavailable." }),
    ).toContainText("Usage is unavailable.")
    await expect(screen.getByRole("link", "Reload")).toBeVisible()
    await db.insert(accountUsage).values({ ownerId: owner.id })
    await screen.getByRole("link", "Reload").tap()
    await expect(browser).toHaveURL("/settings?tab=usage")
    await expect(
      screen.getByText("No API requests in the last 30 days.", { visible: true }),
    ).toBeVisible()
  } finally {
    await db.$client.end()
  }
})

test("translated settings tabs stay reachable on a compact desktop", async ({
  account,
  app,
  browser,
  screen,
}) => {
  void account
  await browser.setViewport({ width: 1024, height: 900 })
  await browser.setCookies([{ url: app.baseUrl ?? "", name: "sniptide-locale", value: "de" }])
  await app.open("/settings?tab=usage")
  await expect(screen.getByRole("tab", "Nutzung")).toBeVisible()
  await app.screenshot("usage-compact-german")
  const tabsFit = await browser.evaluate(() => {
    const tabs = document.querySelector('[role="tablist"]')
    return tabs ? tabs.scrollWidth <= tabs.clientWidth : false
  })
  expect(tabsFit).toBe(true)
})
