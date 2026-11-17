import { createDb } from "@workspace/db"
import { expect } from "e2e"
import { databaseUrl } from "./environment"
import { test } from "./fixtures"

test("slow page navigation shows the next screen's frame at once and fills it in place", async ({
  account,
  app,
  browser,
  screen,
}) => {
  void account
  await app.open("/new")
  await screen.getByLabel("Title").fill("Navigation fixture")
  await screen.getByLabel("Contents of untitled.txt").fill("const ready = true")
  await screen.getByRole("button", /^Create paste/).tap()
  await expect(browser).toHaveURL(/\/pastes\/[^/]+$/)
  // Remembers how many rows the list has, the way a returning visit does.
  await app.open("/pastes")
  await expect(
    screen.getByRole("link", "Navigation fixture", { visible: true }).last(),
  ).toBeVisible()
  await app.open("/dashboard")
  await expect(screen.getByRole("heading", "Connect an agent")).toBeVisible()
  const tableTop = () =>
    browser.evaluate(
      () => document.querySelector("main table thead")?.getBoundingClientRect().top ?? null,
    )
  const db = createDb(databaseUrl())
  try {
    let loading: number | null = null
    await db.$client.begin(async (tx) => {
      await tx.unsafe("LOCK TABLE paste_file IN ACCESS EXCLUSIVE MODE")
      await screen
        .getByRole("region", "Recent pastes")
        .getByRole("link", "View all", { exact: true })
        .tap()
      // The list's own title, view switch and column headers are there before any row is.
      // The account has one paste, so one row waits for it.
      await expect(browser.locator("main tbody tr [data-slot=skeleton]").first()).toBeVisible()
      await expect(browser.locator("main tbody tr")).toHaveCount(1)
      await expect(screen.getByRole("radio", "Grid", { visible: true })).toBeVisible()
      await expect(screen.getByRole("heading", "Connect an agent")).toHaveCount(0)
      loading = await tableTop()
      await app.screenshot("navigation-shows-list-frame")
    })
    await expect(
      screen.getByRole("link", "Navigation fixture", { visible: true }).last(),
    ).toBeVisible()
    await expect(browser.locator("main [data-slot=skeleton]")).toHaveCount(0)
    expect(loading).not.toBeNull()
    expect(await tableTop()).toBe(loading)
  } finally {
    await db.$client.end()
  }
})

test("list header controls are in the server HTML and remain functional after hydration", async ({
  account,
  app,
  browser,
  screen,
}) => {
  void account
  await app.open("/pastes")
  const cookies = await browser.cookies()
  const response = await fetch(new URL("/pastes", app.baseUrl), {
    headers: { cookie: cookies.map(({ name, value }) => `${name}=${value}`).join("; ") },
  })
  const html = await response.text()
  const start = html.indexOf('data-header-actions=""')
  expect(start).toBeGreaterThan(-1)
  const actions = html.slice(start, html.indexOf("</header>", start))
  expect(actions).toContain('aria-label="Grid"')
  expect(actions).toContain("Import gist")
  await app.screenshot("pastes-stable-header")
  await expect(screen.getByRole("radio", "Grid", { visible: true })).toHaveCount(1)
  await screen.getByRole("radio", "Grid", { visible: true }).tap()
  await expect(screen.getByRole("radio", "Grid", { visible: true })).toHaveAttribute(
    "aria-checked",
    "true",
  )
  await screen.getByRole("button", "Import gist", { visible: true }).tap()
  await expect(screen.getByRole("dialog")).toBeVisible()
  await app.open("/collections")
  await browser.locator("[data-header-actions]").getByRole("button", "New collection").tap()
  await expect(screen.getByRole("dialog")).toBeVisible()
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

test("opening a collection or a paste shows its own loading state and never the list's", async ({
  account,
  app,
  browser,
  screen,
}) => {
  void account
  await app.open("/collections")
  await screen.getByRole("button", "New collection", { visible: true }).first().tap()
  await screen.getByLabel("Name").fill("Examples")
  await screen.getByRole("button", "Create collection").tap()
  await expect(browser).toHaveURL(/\/collections\/[^/]+$/)
  await app.open("/new")
  await screen.getByLabel("Title").fill("Detail fixture")
  await screen.getByLabel("Contents of untitled.txt").fill("const ready = true")
  await screen.getByRole("button", /^Create paste/).tap()
  await expect(browser).toHaveURL(/\/pastes\/[^/]+$/)

  // Holds the click's server response, so the screen shows what the router drew from its
  // prefetch alone. Prefetches pass, because the router draws from them.
  const holdNavigation = async (path: RegExp) => {
    const state = { prefetched: false, release: () => {} }
    const released = new Promise<void>((resolve) => {
      state.release = resolve
    })
    await browser.route(path, async (route) => {
      const { headers } = route.request
      if (headers["next-router-prefetch"]) state.prefetched = true
      else if (headers.rsc) await released
      await route.fallback()
    })
    return state
  }
  const titles = () =>
    browser.evaluate(() =>
      [...document.querySelectorAll("main h1")].map((heading) => heading.textContent?.trim() ?? ""),
    )

  for (const target of [
    { link: "Examples", path: /\/collections\/examples/, list: "Collections" },
    { link: "Detail fixture", path: /\/pastes\/[^/?]+\?/, list: "My pastes" },
  ]) {
    const navigation = await holdNavigation(target.path)
    await app.open("/dashboard")
    // A person sees a link for a moment before clicking it, and the router prefetches it then.
    await expect.poll(() => navigation.prefetched).toBe(true)
    await screen.getByRole("link", target.link, { visible: true }).first().tap()
    await expect(browser.locator("main [data-slot=loading]").first()).toBeAttached()
    expect(await titles()).not.toContain(target.list)
    navigation.release()
    await expect(screen.getByRole("heading", target.link)).toBeVisible()
    await browser.unroute(target.path)
  }
})
