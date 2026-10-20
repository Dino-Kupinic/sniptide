import { expect } from "e2e"
import { test } from "./fixtures"

test("saving with unavailable local storage reports failure and preserves typing", async ({
  app,
  browser,
  screen,
}) => {
  await app.open("/new")
  await browser.evaluate(() => {
    Object.defineProperty(window, "indexedDB", { configurable: true, value: undefined })
    return null
  })
  const editor = screen.getByLabel("Contents of untitled.txt")
  await editor.fill("Keep this text when storage fails")
  await editor.press("Control+s")
  await expect(
    screen.getByText("Couldn't save a draft on this device. Keep this tab open and try again."),
  ).toBeVisible()
  await expect(screen.getByText("Draft saved on this device")).not.toBeVisible()
  await expect(editor).toHaveValue("Keep this text when storage fails")
})
