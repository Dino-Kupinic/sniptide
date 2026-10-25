import { expect } from "e2e"
import { test } from "./fixtures"

const python = 'def greet(name):\n    return f"Hello {name}"'

test("content alone supplies a title and language and creates a paste", async ({
  app,
  screen,
  browser,
}) => {
  await app.open("/new")
  await screen.getByLabel("Contents of untitled.txt").fill(python)
  await expect(screen.getByLabel("Title")).toHaveValue("def greet(name):")
  await expect(screen.getByLabel("Contents of untitled.py")).toHaveValue(python)
  await screen.getByRole("button", /^Create paste/).tap()
  await expect(browser).toHaveURL(/\/pastes\/[^/]+$/)
  await expect(screen.getByRole("heading", "def greet(name):")).toBeVisible()
})

test("manual title and plain text language survive content changes and draft restoration", async ({
  app,
  screen,
  browser,
}) => {
  await app.open("/new")
  await screen.getByLabel("Contents of untitled.txt").fill(python)
  await screen.getByLabel("Title").fill("My chosen title")
  await screen.getByRole("combobox", /^Language.*Python/).tap()
  await screen.getByRole("option", "Plain text").tap()
  await screen.getByLabel("Contents of untitled.txt").fill("console.log('changed')")
  await expect(screen.getByLabel("Title")).toHaveValue("My chosen title")
  await expect(screen.getByLabel("Contents of untitled.txt")).toHaveValue("console.log('changed')")
  await screen.getByLabel("Contents of untitled.txt").press("Meta+s")
  await expect(screen.getByText("Draft saved on this device")).toBeVisible()
  const off = await browser.onDialog("accept")
  await app.open("/new")
  await off()
  await expect(screen.getByLabel("Title")).toHaveValue("My chosen title")
  await screen.getByLabel("Contents of untitled.txt").fill(python)
  await expect(screen.getByLabel("Contents of untitled.txt")).toHaveValue(python)
  await expect(screen.getByLabel("Title")).toHaveValue("My chosen title")
})

test("successful choices become defaults in the editor and dashboard", async ({
  app,
  screen,
  browser,
}) => {
  await app.open("/new")
  await screen.getByLabel("Contents of untitled.txt").fill(python)
  await screen.getByRole("radio", "Public", { visible: true }).check()
  await screen.getByRole("slider", "Expires after", { visible: true }).press("Home")
  await screen.getByRole("button", /^Create paste/).tap()
  await expect(browser).toHaveURL(/\/pastes\/[^/]+$/)
  await app.open("/new")
  await expect(screen.getByRole("radio", "Public", { visible: true })).toBeChecked()
  await expect(screen.getByRole("slider", "Expires after", { visible: true })).toHaveAttribute(
    "aria-valuetext",
    "1h",
  )
  await app.open("/dashboard")
  await expect(screen.getByRole("button", /^Visibility.*Public/)).toBeVisible()
  await expect(screen.getByRole("button", /^Expires after.*1 hour/)).toBeVisible()
  await screen.getByLabel("Code").fill(python)
  await expect(screen.getByLabel("Title")).toHaveValue("def greet(name):")
  await screen.getByRole("button", /^Create paste/).tap()
  await expect(browser).toHaveURL(/\/pastes\/[^/]+$/)
})

test("environment content defaults to private and a deliberate override stays selected", async ({
  app,
  screen,
}) => {
  await app.open("/new")
  await screen.getByLabel("Contents of untitled.txt").fill("EXAMPLE_TOKEN=fixture-value")
  await expect(screen.getByRole("radio", "Private", { visible: true })).toBeChecked()
  await expect(screen.getByLabel("Title")).toHaveValue("untitled.sh")
  await screen.getByRole("radio", "Unlisted", { visible: true }).check()
  await screen.getByLabel("Contents of untitled.sh").fill("EXAMPLE_TOKEN=another-fixture-value")
  await expect(screen.getByRole("radio", "Unlisted", { visible: true })).toBeChecked()
})

test("an empty dashboard draft keeps suggestions on the next visit", async ({ app, screen }) => {
  await app.open("/dashboard")
  await expect(screen.getByLabel("Title")).toHaveValue("")
  await screen.getByLabel("Code").press("Meta+s")
  await app.open("/dashboard")
  await screen.getByLabel("Code").fill("EXAMPLE_TOKEN=fixture-value")
  await expect(screen.getByLabel("Title")).toHaveValue("untitled.sh")
  await expect(screen.getByRole("button", /^Visibility.*Private/)).toBeVisible()
})

test("new files keep automatic language when their default name is left unchanged", async ({
  app,
  screen,
}) => {
  await app.open("/new")
  await screen.getByRole("button", "Add file").tap()
  await screen.getByLabel("Contents of untitled-2.txt").fill(python)
  await expect(screen.getByLabel("Contents of untitled-2.py")).toHaveValue(python)
})

test("a title-only dashboard draft preserves automatic language and private defaults", async ({
  app,
  screen,
}) => {
  await app.open("/dashboard")
  await screen.getByLabel("Title").fill("My saved title")
  await screen.getByLabel("Code").press("Meta+s")
  await app.open("/dashboard")
  await expect(screen.getByLabel("Title")).toHaveValue("My saved title")
  await screen.getByLabel("Code").fill("EXAMPLE_TOKEN=fixture-value")
  await expect(screen.getByRole("button", /^Visibility.*Private/)).toBeVisible()
  await expect(screen.getByRole("combobox", "Language")).toContainText("Shell")
  await expect(screen.getByLabel("Title")).toHaveValue("My saved title")
})

test("a title-only editor draft preserves automatic language and private defaults", async ({
  app,
  screen,
  browser,
}) => {
  await app.open("/new")
  await screen.getByLabel("Title").fill("My saved title")
  await screen.getByLabel("Contents of untitled.txt").press("Meta+s")
  await expect(screen.getByText("Draft saved on this device")).toBeVisible()
  const off = await browser.onDialog("accept")
  await app.open("/new")
  await off()
  await expect(screen.getByLabel("Title")).toHaveValue("My saved title")
  await screen.getByLabel("Contents of untitled.txt").fill("EXAMPLE_TOKEN=fixture-value")
  await expect(screen.getByLabel("Contents of untitled.sh")).toBeVisible()
  await expect(screen.getByRole("radio", "Private", { visible: true })).toBeChecked()
  await expect(screen.getByLabel("Title")).toHaveValue("My saved title")
})

test("undoing file removal restores its automatic title without losing other edits", async ({
  app,
  screen,
}) => {
  await app.open("/new")
  await screen.getByLabel("Contents of untitled.txt").fill(python)
  await screen.getByRole("button", "Add file").tap()
  await screen.getByRole("tab", "untitled.py").tap()
  await screen.getByRole("tab", "untitled.py").press("Delete")
  await expect(screen.getByLabel("Title")).toHaveValue("")
  await screen.getByLabel("Description").fill("Keep this description")
  await screen.getByRole("button", "Undo", { visible: true }).tap()
  await expect(screen.getByLabel("Contents of untitled.py")).toHaveValue(python)
  await expect(screen.getByLabel("Title")).toHaveValue("def greet(name):")
  await expect(screen.getByLabel("Description")).toHaveValue("Keep this description")
})
