import { expect } from "e2e"
import { test } from "./fixtures"

test("large files remain visible and editable with bounded editor markup", async ({
  app,
  browser,
  screen,
}) => {
  await app.open("/new")
  await screen.getByLabel("Title").fill("Large file editing")
  const content = Array.from({ length: 2000 }, (_, index) => `line ${index}`).join("\n")
  const editor = screen.getByLabel("Contents of untitled.txt")
  await editor.fill(content)
  await expect(editor).toHaveValue(content)
  const layout = await browser.evaluate(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label^="Contents of"]',
    )
    if (!textarea) throw new Error("The editor is missing")
    return {
      elements: textarea.parentElement?.parentElement?.querySelectorAll("div").length ?? 0,
      transparent: getComputedStyle(textarea).color === "rgba(0, 0, 0, 0)",
      rows: textarea.rows,
    }
  })
  expect(layout.elements).toBeLessThan(10)
  expect(layout.transparent).toBe(false)
  expect(layout.rows).toBe(12)
  await editor.press("End")
  await editor.press("Enter")
  await expect(editor).toHaveValue(`${content}\n`)
})
