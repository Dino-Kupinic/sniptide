import { createDb } from "@workspace/db"
import { expect } from "e2e"
import { databaseUrl } from "./environment"
import { test } from "./fixtures"

test("dashboard streams its data regions without interrupting Quick Paste", async ({
  account,
  app,
  browser,
  screen,
}) => {
  void account
  const db = createDb(databaseUrl())
  let navigation: ReturnType<typeof browser.reload> | undefined
  try {
    await app.open("/dashboard")
    await db.$client.begin(async (tx) => {
      await tx.unsafe("LOCK TABLE paste_view_day IN ACCESS EXCLUSIVE MODE")
      navigation = browser.reload()
      await expect(browser.locator("main > div > [aria-busy=true]").first()).toBeVisible()
      await expect(screen.getByLabel("Code", { exact: true })).toBeVisible()
      await screen.getByLabel("Code", { exact: true }).fill("const draft = 'keep me'")
      await app.screenshot("dashboard-loading-quick-paste")
    })
    await navigation
    await expect(screen.getByLabel("Code", { exact: true })).toHaveValue("const draft = 'keep me'")
    await expect(browser.locator("main [aria-busy=true]")).toHaveCount(0)
  } finally {
    await navigation
    await db.$client.end()
  }
})

test("paste rows have measured first-load skeletons that resize on mobile", async ({
  account,
  app,
  browser,
  screen,
}) => {
  void account
  await app.open("/new")
  await screen.getByLabel("Title").fill("Loading state fixture")
  await screen.getByLabel("Contents of untitled.txt").fill("export const ready = true")
  await screen.getByRole("button", /^Create paste/).tap()
  await expect(browser).toHaveURL(/\/pastes\/[^/]+$/)
  await app.open("/pastes")
  await expect(
    screen.getByRole("searchbox", "Filter by title or slug", { visible: true }),
  ).toBeVisible()
  const db = createDb(databaseUrl())
  let navigation: ReturnType<typeof browser.reload> | undefined
  try {
    await db.$client.begin(async (tx) => {
      await tx.unsafe("LOCK TABLE paste_file IN ACCESS EXCLUSIVE MODE")
      navigation = browser.reload()
      await expect(browser.locator("main [skullet-reveal][aria-busy=true]").first()).toBeVisible()
      await expect(
        browser.locator("main [skullet-loading][aria-hidden=true][inert]").first(),
      ).toBeVisible()
      // Sample text must never become a focusable, prefetched paste link.
      await expect(screen.getByRole("link", "Request validation")).toHaveCount(0)
      await app.screenshot("pastes-loading-desktop")
      await browser.setViewport({ width: 390, height: 844 })
      await expect
        .poll(() =>
          browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        )
        .toBe(true)
      await app.screenshot("pastes-loading-mobile")
    })
    await navigation
    await expect(
      screen.getByRole("link", "Loading state fixture", { visible: true }).last(),
    ).toBeVisible()
    await expect(browser.locator("main [skullet-reveal][aria-busy=true]")).toHaveCount(0)
  } finally {
    await navigation
    await db.$client.end()
  }
})

test("filtering retains current paste rows while the next result is pending", async ({
  account,
  app,
  browser,
  screen,
}) => {
  void account
  await app.open("/new")
  await screen.getByLabel("Title").fill("Retained loading fixture")
  await screen.getByLabel("Contents of untitled.txt").fill("const retained = true")
  await screen.getByRole("button", /^Create paste/).tap()
  await expect(browser).toHaveURL(/\/pastes\/[^/]+$/)
  await app.open("/pastes")
  await expect(
    screen.getByRole("searchbox", "Filter by title or slug", { visible: true }),
  ).toBeVisible()
  const db = createDb(databaseUrl())
  try {
    await db.$client.begin(async (tx) => {
      await tx.unsafe("LOCK TABLE paste_file IN ACCESS EXCLUSIVE MODE")
      await screen
        .getByRole("searchbox", "Filter by title or slug", { visible: true })
        .fill("Retained")
      await expect(browser.locator("main > [aria-busy=true]")).toBeVisible()
      await expect(
        screen.getByRole("link", "Retained loading fixture", { visible: true }).last(),
      ).toBeVisible()
      await expect(browser.locator("main [skullet-reveal][aria-busy=true]")).toHaveCount(0)
    })
    await expect(browser.locator("main > [aria-busy=true]")).toHaveCount(0)
    await expect(
      screen.getByRole("link", "Retained loading fixture", { visible: true }).last(),
    ).toBeVisible()
  } finally {
    await db.$client.end()
  }
})

test("notifications distinguish loading, failure and empty results", async ({
  account,
  app,
  browser,
  screen,
}) => {
  void account
  let release = () => {}
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  let failed = false
  await browser.route("**/api/notifications", async (route) => {
    await pending
    await route.fulfill({
      status: failed ? 200 : 500,
      json: failed ? { items: [], unread: 0 } : { error: "fixture" },
    })
    failed = true
  })
  try {
    await app.open("/dashboard")
    await screen.getByRole("button", "Notifications", { exact: true, visible: true }).tap()
    await expect(browser.locator("[skullet-reveal][aria-busy=true]").last()).toBeVisible()
    await app.screenshot("notifications-loading")
    release()
    await expect(screen.getByText("Couldn't load notifications")).toBeVisible()
    await screen.getByRole("button", "Try again").tap()
    await expect(screen.getByText("You're all caught up")).toBeVisible()
  } finally {
    release()
  }
})

test("signing out clears remembered skeleton shapes", async ({ account, app, browser, screen }) => {
  void account
  await app.open("/settings")
  await browser.setViewport({ width: 390, height: 844 })
  await browser.evaluate(() => {
    localStorage.setItem("skullet:shapes", "fixture")
    return null
  })
  await screen.getByRole("button", "Sign out", { exact: true }).tap()
  await expect(browser).toHaveURL("/sign-in")
  expect(await browser.evaluate(() => localStorage.getItem("skullet:shapes"))).toBeNull()
})

test("loading labels follow the locale and skeletons respect dark mode and reduced motion", async ({
  account,
  app,
  browser,
  screen,
}) => {
  void account
  await browser.setViewport({ width: 390, height: 844 })
  await browser.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" })
  await browser.setCookies([{ url: app.baseUrl ?? "", name: "sniptide-locale", value: "de" }])
  let release = () => {}
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await browser.route("**/api/notifications", async (route) => {
    await pending
    await route.fulfill({ json: { items: [], unread: 0 } })
  })
  try {
    await app.open("/dashboard")
    await screen.getByRole("button", "Benachrichtigungen", { exact: true, visible: true }).tap()
    await expect(browser.locator("[skullet-status]")).toContainText("Wird geladen")
    await expect(browser.locator("html")).toHaveAttribute("class", /dark/)
    await expect
      .poll(() =>
        browser.evaluate(
          () =>
            document.getAnimations().filter((animation) => animation.playState === "running")
              .length,
        ),
      )
      .toBe(0)
    expect(
      await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await app.screenshot("notifications-loading-german-dark-reduced-motion")
    release()
    await expect(screen.getByText("Du bist auf dem neuesten Stand")).toBeVisible()
  } finally {
    release()
  }
})
