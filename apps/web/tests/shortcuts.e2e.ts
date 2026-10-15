import { randomUUID } from "node:crypto"
import { expect } from "e2e"
import { test } from "./fixtures"

test("? opens the shortcut sheet and lists every group", async ({ app, browser, screen }) => {
  await app.open("/dashboard")
  await browser.keyboard.press("?")
  const sheet = screen.getByRole("dialog", "Keyboard shortcuts")
  await expect(sheet).toBeVisible()
  for (const heading of ["General", "Go to", "Editor", "Command menu"]) {
    await expect(sheet.getByRole("heading", heading)).toBeVisible()
  }
  await expect(sheet.getByText("Create or save the paste")).toBeVisible()
  await browser.keyboard.press("?")
  await expect(sheet).not.toBeVisible()
})

test("n starts a new paste and / opens search, but not while typing", async ({
  app,
  browser,
  screen,
}) => {
  await app.open("/dashboard")
  await browser.keyboard.press("/")
  await expect(screen.getByRole("dialog", "Command menu")).toBeVisible()
  await browser.keyboard.press("Escape")
  await expect(screen.getByRole("dialog", "Command menu")).not.toBeVisible()

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

test("Ctrl+S saves the paste from the editor", async ({ app, browser, screen }) => {
  const title = `Shortcut snippet ${randomUUID()}`
  await app.open("/new")
  await screen.getByLabel("Title").fill(title)
  await screen.getByLabel("Contents of untitled.txt").fill("saved from the keyboard")
  await screen.getByLabel("Contents of untitled.txt").press("Control+s")
  await expect(browser).toHaveURL(/\/pastes\/[^/]+$/)
  await expect(screen.getByRole("heading", title)).toBeVisible()
})
