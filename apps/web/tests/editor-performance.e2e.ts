import { expect } from "e2e"
import { test } from "./fixtures"

test("large files remain visible and editable with bounded editor markup", async ({
  app,
  browser,
  screen,
}) => {
  await app.open("/new")
  await screen.getByLabel("Title").fill("Large file editing")
  const content = Array.from({ length: 1500 }, (_, index) => `line ${index}`).join("\n")
  const editor = screen.getByLabel("Contents of untitled.txt")
  await editor.fill(content)
  await expect(editor).toHaveValue(content)
  await editor.press("Enter")
  const layout = await browser.evaluate(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label^="Contents of"]',
    )
    if (!textarea) throw new Error("The editor is missing")
    return {
      elements: textarea.parentElement?.parentElement?.querySelectorAll("div").length ?? 0,
      transparent: getComputedStyle(textarea).color === "rgba(0, 0, 0, 0)",
      rows: textarea.rows,
      focused: document.activeElement === textarea,
      selection: textarea.selectionStart,
      length: textarea.value.length,
    }
  })
  expect(layout.elements).toBeLessThan(10)
  expect(layout.transparent).toBe(false)
  expect(layout.rows).toBe(12)
  expect(layout.focused).toBe(true)
  expect(layout.selection).toBe(layout.length)
  await expect(editor).toHaveValue(`${content}\n`)
  await editor.press("Backspace")
  await expect(editor).toHaveValue(content)
  const restored = await browser.evaluate(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label^="Contents of"]',
    )
    if (!textarea) throw new Error("The editor is missing")
    return {
      focused: document.activeElement === textarea,
      selection: textarea.selectionStart,
      length: textarea.value.length,
    }
  })
  expect(restored.focused).toBe(true)
  expect(restored.selection).toBe(restored.length)
})
