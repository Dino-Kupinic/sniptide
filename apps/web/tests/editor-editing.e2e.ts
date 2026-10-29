import { expect } from "e2e"
import { test } from "./fixtures"

test("selected lines indent, outdent and undo without losing content or focus", async ({
  app,
  browser,
  screen,
}) => {
  await app.open("/new")
  const editor = screen.getByLabel(/^Contents of /)
  await editor.fill("one\ntwo\nthree")
  await editor.press("ControlOrMeta+a")
  await editor.press("Tab")
  await expect(editor).toHaveValue("  one\n  two\n  three")
  await expect(editor).toBeFocused()
  await editor.press("Tab")
  await expect(editor).toHaveValue("    one\n    two\n    three")
  await editor.press("Shift+Tab")
  await expect(editor).toHaveValue("  one\n  two\n  three")
  await editor.press("ControlOrMeta+z")
  await expect(editor).toHaveValue("    one\n    two\n    three")
  await editor.press("ControlOrMeta+z")
  await expect(editor).toHaveValue("  one\n  two\n  three")
  await editor.press("ControlOrMeta+z")
  await expect(editor).toHaveValue("one\ntwo\nthree")
  expect(
    await browser.evaluate(() => {
      const field = document.activeElement as HTMLTextAreaElement
      return [field.selectionStart, field.selectionEnd]
    }),
  ).toEqual([0, 13])
  await editor.press("ControlOrMeta+Shift+z")
  await expect(editor).toHaveValue("  one\n  two\n  three")
  await editor.press("Shift+Tab")
  await expect(editor).toHaveValue("one\ntwo\nthree")
})

test("braces pair, nest and skip existing closers with the caret in the right place", async ({
  app,
  screen,
}) => {
  await app.open("/new")
  const editor = screen.getByLabel(/^Contents of /)
  await editor.press("{")
  await expect(editor).toHaveValue("{}")
  await editor.press("{")
  await expect(editor).toHaveValue("{{}}")
  await editor.press("}")
  await editor.press("}")
  await editor.press("x")
  await expect(editor).toHaveValue("{{}}x")
  await editor.press("ControlOrMeta+a")
  await editor.press("(")
  await expect(editor).toHaveValue("({{}}x)")
  await editor.press("ControlOrMeta+z")
  await expect(editor).toHaveValue("{{}}x")
})

test("Enter indents inside braces and paired Backspace can be undone", async ({ app, screen }) => {
  await app.open("/new")
  const editor = screen.getByLabel(/^Contents of /)
  await editor.press("{")
  await editor.press("Enter")
  await expect(editor).toHaveValue("{\n  \n}")
  await editor.press("x")
  await expect(editor).toHaveValue("{\n  x\n}")
  await editor.press("ControlOrMeta+z")
  await expect(editor).toHaveValue("{\n  \n}")
  await editor.press("ControlOrMeta+z")
  await expect(editor).toHaveValue("{}")
  await editor.press("Backspace")
  await expect(editor).toHaveValue("")
  await editor.press("ControlOrMeta+z")
  await expect(editor).toHaveValue("{}")
})

test("braces pair when typed with Option or AltGr keyboard modifiers", async ({
  app,
  browser,
  screen,
}) => {
  await app.open("/new")
  const editor = screen.getByLabel(/^Contents of /)
  await editor.press("Alt+{")
  await expect(editor).toHaveValue("{}")
  await editor.press("Alt+}")
  await editor.press("x")
  await expect(editor).toHaveValue("{}x")
  await editor.fill("")
  await browser.evaluate(() => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "{",
        ctrlKey: true,
        altKey: true,
        modifierAltGraph: true,
        bubbles: true,
        cancelable: true,
      }),
    )
    return null
  })
  await expect(editor).toHaveValue("{}")
})
