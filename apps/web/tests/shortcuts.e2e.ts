import { randomUUID } from "node:crypto"
import type { Browser } from "@e2e-dev/web"
import { expect } from "e2e"
import { test } from "./fixtures"

// A key pressed before the page hydrates goes nowhere, and the page can look loaded a moment
// before it is, so press until a dialog shows up.
async function pressUntilDialog(browser: Browser, key: string) {
  const dialogOpen = () =>
    browser.evaluate(() => document.querySelector('[role="dialog"]') !== null)
  await expect
    .poll(async () => {
      if (await dialogOpen()) return true
      await browser.keyboard.press(key)
      return dialogOpen()
    })
    .toBe(true)
}

test("? opens the shortcut sheet and lists every group", async ({ app, browser, screen }) => {
  await app.open("/dashboard")
  await pressUntilDialog(browser, "?")
  const sheet = screen.getByRole("dialog", "Keyboard shortcuts")
  await expect(sheet).toBeVisible()
  for (const heading of ["General", "Go to", "Editor", "Command menu"]) {
    await expect(sheet.getByRole("heading", heading)).toBeVisible()
  }
  await expect(sheet.getByText("Create the paste or finish editing")).toBeVisible()
  await browser.keyboard.press("?")
  await expect(sheet).not.toBeVisible()
})

test("n starts a new paste and / opens search, but not while typing", async ({
  app,
  browser,
  screen,
}) => {
  await app.open("/dashboard")
  const search = screen.getByLabel("Search pastes, collections, or run a command")
  await pressUntilDialog(browser, "/")
  await expect(search).toBeVisible()
  await browser.keyboard.press("Escape")
  await expect(search).not.toBeVisible()

  await browser.keyboard.press("n")
  await expect(browser).toHaveURL(/\/new$/)

  // Typed into a field, the same keys are just letters.
  const title = screen.getByLabel("Title")
  await title.press("n")
  await title.press("?")
  await expect(title).toHaveValue("n?")
  await expect(browser).toHaveURL(/\/new$/)
  await expect(screen.getByRole("dialog")).toHaveCount(0)
})

test("T then T flips the theme but a lone D does not", async ({ app, browser, screen }) => {
  await app.open("/dashboard")
  const isDark = () => browser.evaluate(() => document.documentElement.classList.contains("dark"))
  // Wait for hydration with a shortcut that opens something, then close it again.
  await pressUntilDialog(browser, "/")
  await browser.keyboard.press("Escape")
  await expect(screen.getByLabel("Search pastes, collections, or run a command")).not.toBeVisible()

  const before = await isDark()
  await browser.keyboard.press("d")
  expect(await isDark()).toBe(before)
  await browser.keyboard.press("t")
  await browser.keyboard.press("t")
  await expect.poll(isDark).toBe(!before)
})

test("undo and redo step through the editor's text, indents included", async ({ app, screen }) => {
  await app.open("/new")
  const editor = screen.getByLabel("Contents of untitled.txt")
  await editor.fill("one")
  await editor.press("Tab")
  await editor.press("Control+z")
  await expect(editor).toHaveValue("one")
  await editor.press("Control+z")
  await expect(editor).toHaveValue("")
  await editor.press("Control+Shift+z")
  await expect(editor).toHaveValue("one")
  await editor.press("Control+y")
  await expect(editor).toHaveValue("one  ")
})

test("Ctrl+S keeps a draft and Ctrl+Enter creates the paste", async ({ app, browser, screen }) => {
  const title = `Shortcut snippet ${randomUUID()}`
  await app.open("/new")
  await screen.getByLabel("Title").fill(title)
  const editor = screen.getByLabel("Contents of untitled.txt")
  await editor.fill("saved from the keyboard")

  // Ctrl+S stays in the editor and says where the draft went. The draft is only kept once the
  // editor has started backing up, so press until the notice shows.
  const toastShown = () =>
    browser.evaluate(() => document.body.innerText.includes("Draft saved on this device"))
  await expect
    .poll(async () => {
      await editor.press("Control+s")
      return toastShown()
    })
    .toBe(true)
  await expect(browser).toHaveURL(/\/new$/)

  await editor.press("Control+Enter")
  await expect(browser).toHaveURL(/\/pastes\/[^/]+$/)
  const slug = new URL(await browser.url()).pathname.split("/").at(-1)
  const raw = await fetch(new URL(`/${slug}/raw`, app.baseUrl))
  expect(await raw.text()).toBe("saved from the keyboard")
})
