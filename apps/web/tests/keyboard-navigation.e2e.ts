import { expect } from "e2e"
import { test } from "./fixtures"

test("skip link focuses the main content", async ({ app, browser, screen }) => {
  await app.open("/dashboard")
  await browser.keyboard.press("Tab")
  const skip = screen.getByRole("link", "Skip to main content")
  await expect(skip).toBeFocused()
  await skip.press("Enter")
  await expect(screen.getByRole("main")).toBeFocused()
})

test("file tabs support keyboard selection, rename and removal", async ({
  app,
  screen,
  browser,
}) => {
  await app.open("/new")
  const first = screen.getByRole("tab", "untitled.txt")
  await screen.getByRole("button", "Add file").tap()
  const name = screen.getByLabel("File name")
  await name.fill("second.ts")
  await name.press("Enter")
  const second = screen.getByRole("tab", "second.ts")
  await expect(second).toBeFocused()
  await second.press("ArrowLeft")
  await expect(first).toBeFocused()
  await expect(first).toHaveAttribute("aria-selected", "true")
  await first.press("ArrowLeft")
  await expect(second).toBeFocused()
  await second.press("Home")
  await expect(first).toBeFocused()
  await first.press("End")
  await expect(second).toBeFocused()
  const panelRelationship = () =>
    browser.evaluate(() => {
      const tab = document.querySelector('[role="tab"][aria-selected="true"]')
      const panel = document.getElementById(tab?.getAttribute("aria-controls") ?? "")
      return panel?.getAttribute("role") ?? null
    })
  expect(await panelRelationship()).toBe("tabpanel")
  await second.press("ArrowDown")
  await expect(screen.getByRole("menu")).toBeVisible()
  expect(await panelRelationship()).toBe("tabpanel")
  await screen.getByRole("menuitem", "Rename").focus()
  await screen.getByRole("menuitem", "Rename").press("Enter")
  await name.fill("renamed.ts")
  await name.press("Enter")
  const renamed = screen.getByRole("tab", "renamed.ts")
  await expect(renamed).toBeFocused()
  await renamed.press("ArrowDown")
  await expect(screen.getByRole("menu")).toBeVisible()
  await browser.keyboard.press("Escape")
  await expect(renamed).toBeFocused()
  await renamed.press("F2")
  await name.fill("second.ts")
  await name.press("Enter")
  await expect(second).toBeFocused()
  await second.press("F2")
  await name.fill("cancelled.ts")
  await name.press("Escape")
  await expect(second).toBeFocused()
  await second.press("Delete")
  await expect(first).toBeFocused()
  await expect(screen.getByRole("tab", "second.ts")).toHaveCount(0)
})

test("editor preserves indentation and Escape then Tab exits", async ({ app, screen }) => {
  await app.open("/new")
  const editor = screen.getByLabel("Contents of untitled.txt")
  await editor.fill("one")
  await editor.press("Tab")
  await expect(editor).toHaveValue("one  ")
  await editor.press("Escape")
  await editor.press("x")
  await editor.press("Tab")
  await expect(editor).toHaveValue("one  x  ")
  await editor.press("Escape")
  await editor.press("Tab")
  await expect(editor).not.toBeFocused()
  await expect(editor).toHaveValue("one  x  ")
})

test("dashboard and settings tabs navigate with the keyboard", async ({ app, screen }) => {
  await app.open("/dashboard")
  const filters = screen.getByRole("tablist", "Filter recent pastes")
  const all = filters.getByRole("tab", "All")
  const publicTab = filters.getByRole("tab", "Public")
  await all.focus()
  await all.press("ArrowRight")
  await expect(publicTab).toBeFocused()
  await expect(publicTab).toHaveAttribute("aria-selected", "true")
  await publicTab.press("End")
  await expect(filters.getByRole("tab", "Private")).toBeFocused()
  await app.open("/settings")
  const settings = screen.getByRole("tablist", "Settings")
  const general = settings.getByRole("tab", "General")
  await general.focus()
  await general.press("ArrowRight")
  await expect(settings.getByRole("tab", "Account")).toBeFocused()
  await expect(settings.getByRole("tab", "Account")).toHaveAttribute("aria-selected", "true")
})

test("dashboard pins actions and removes the fade at the scroll end and when it fits", async ({
  app,
  browser,
  screen,
}) => {
  await app.open("/new")
  await screen.getByLabel("Title").fill("Pinned action test")
  await screen.getByLabel("Contents of untitled.txt").fill("content")
  await screen.getByRole("button", /^Create paste/).tap()
  await expect(browser).toHaveURL(/\/pastes\/[^/]+$/)
  await browser.setViewport({ width: 1024, height: 900 })
  await app.open("/dashboard")
  await expect(screen.getByRole("row").filter({ hasText: "Pinned action test" })).toBeVisible()
  const state = () =>
    browser.evaluate(() => {
      const container = document.querySelector<HTMLElement>('[data-slot="table-container"]')
      const pinned = container?.querySelector<HTMLElement>("tbody td:last-child")
      return {
        atEnd: container?.dataset.atEnd ?? null,
        overflows: !!container && container.scrollWidth > container.clientWidth,
        sticky: pinned ? getComputedStyle(pinned).position : null,
        fade: pinned ? getComputedStyle(pinned, "::before").opacity : null,
      }
    })
  await expect
    .poll(state)
    .toMatchObject({ atEnd: "false", overflows: true, sticky: "sticky", fade: "1" })
  const title = screen
    .getByRole("row")
    .filter({ hasText: "Pinned action test" })
    .getByRole("link", "Pinned action test", { exact: true })
  await title.focus()
  await title.press("ArrowRight")
  await expect
    .poll(() =>
      browser.evaluate(
        () => document.querySelector('[data-slot="table-container"]')?.scrollLeft ?? 0,
      ),
    )
    .toBeGreaterThan(0)
  const actions = screen
    .getByRole("row")
    .filter({ hasText: "Pinned action test" })
    .getByRole("button", "Actions for Pinned action test")
  await actions.tap()
  await expect(screen.getByRole("menu")).toBeVisible()
  await browser.keyboard.press("Escape")
  await browser.evaluate(() => {
    const container = document.querySelector<HTMLElement>('[data-slot="table-container"]')
    if (container) container.scrollLeft = container.scrollWidth
    return null
  })
  await expect.poll(state).toMatchObject({ atEnd: "true", overflows: true, fade: "0" })
  await actions.tap()
  await expect(screen.getByRole("menu")).toBeVisible()
  await browser.keyboard.press("Escape")
  await browser.setViewport({ width: 1800, height: 900 })
  await expect.poll(state).toMatchObject({ atEnd: "true", overflows: false, fade: "0" })
})

for (const view of ["viewer", "embed"] as const) {
  test(`${view} code panel scrolls with native reading keys`, async ({ app, browser, screen }) => {
    await app.open("/new")
    await screen.getByLabel("Title").fill("Scrollable code test")
    await screen
      .getByLabel("Contents of untitled.txt")
      .fill(
        Array.from({ length: 90 }, (_, index) => `line ${index} ${"wide code ".repeat(40)}`).join(
          "\n",
        ),
      )
    await screen.getByRole("button", /^Create paste/).tap()
    await expect(browser).toHaveURL(/\/pastes\/[^/]+$/)
    const slug = new URL(await browser.url()).pathname.split("/").at(-1)
    if (view === "embed") await app.open(`/${slug}/embed`)
    const panel = screen.getByRole(view === "embed" ? "region" : "tabpanel", "untitled.txt")
    const scrollState = () =>
      browser.evaluate(() => {
        const code = document.querySelector(
          '[role="tabpanel"] ol, [role="region"] ol',
        )?.parentElement
        return { left: code?.scrollLeft ?? 0, top: code?.scrollTop ?? 0 }
      })
    await panel.focus()
    if (view === "embed") {
      await panel.press("PageDown")
      await expect.poll(async () => (await scrollState()).top).toBeGreaterThan(0)
    }
    await panel.press("ArrowRight")
    await expect.poll(async () => (await scrollState()).left).toBeGreaterThan(0)
  })
}

test("single-file embed keeps its compact header and names its code region", async ({
  app,
  browser,
  screen,
}) => {
  await app.open("/new")
  await screen.getByLabel("Title").fill("Compact embed test")
  await screen.getByLabel("Contents of untitled.txt").fill("single file content")
  await screen.getByRole("button", /^Create paste/).tap()
  await expect(browser).toHaveURL(/\/pastes\/[^/]+$/)
  const slug = new URL(await browser.url()).pathname.split("/").at(-1)
  await app.open(`/${slug}/embed`)
  await expect(screen.getByRole("tablist")).toHaveCount(0)
  await expect(screen.getByRole("region", "untitled.txt")).toBeVisible()
})

test("view and embed file tabs select files with arrow keys", async ({ app, browser, screen }) => {
  await app.open("/new")
  await screen.getByLabel("Title").fill("File navigation test")
  await screen.getByLabel("Contents of untitled.txt").fill("first content")
  await screen.getByRole("button", "Add file").tap()
  await screen.getByLabel("File name").fill("second.txt")
  await screen.getByLabel("File name").press("Enter")
  await screen.getByLabel("Contents of second.txt").fill("second content")
  await screen.getByRole("button", /^Create paste/).tap()
  await expect(browser).toHaveURL(/\/pastes\/[^/]+$/)
  const slug = new URL(await browser.url()).pathname.split("/").at(-1)
  const first = screen.getByRole("tab", "untitled.txt")
  await first.focus()
  await first.press("ArrowRight")
  await expect(screen.getByRole("tab", "second.txt")).toBeFocused()
  await expect(screen.getByText("second content")).toBeVisible()
  await app.open(`/${slug}/embed`)
  const embedFirst = screen.getByRole("tab", "untitled.txt")
  await embedFirst.focus()
  await embedFirst.press("End")
  await expect(screen.getByRole("tab", "second.txt")).toBeFocused()
  await expect(screen.getByText("second content")).toBeVisible()
})
