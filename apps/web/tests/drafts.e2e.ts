import { expect } from "e2e"
import { test } from "./fixtures"

test("navigation flushes the latest pending local draft", async ({ app, browser, screen }) => {
  await app.open("/dashboard")
  await app.open("/new")
  await screen.getByLabel("Title").fill("Navigation recovery")
  const editor = screen.getByLabel("Contents of untitled.txt")
  await editor.fill("older saved text")
  await expect
    .poll(async () => {
      await editor.press("Control+s")
      return browser.evaluate(() => document.body.innerText.includes("Draft saved on this device"))
    })
    .toBe(true)
  await expect
    .poll(() =>
      browser.evaluate(
        () =>
          new Promise<boolean>((resolve, reject) => {
            const open = indexedDB.open("sniptide", 1)
            open.onerror = () => reject(open.error)
            open.onsuccess = () => {
              const db = open.result
              const read = db.transaction("drafts").objectStore("drafts").getAll()
              read.onsuccess = () => {
                db.close()
                resolve(
                  read.result.some(
                    (draft: { value: { files: { content: string }[] } }) =>
                      draft.value.files[0]?.content === "older saved text",
                  ),
                )
              }
              read.onerror = () => reject(read.error)
            }
          }),
      ),
    )
    .toBe(true)

  await browser.evaluate(() => {
    const schedule = window.setTimeout.bind(window)
    Object.defineProperty(window, "setTimeout", {
      value: (handler: TimerHandler, delay?: number, ...args: unknown[]) => {
        if (delay === 400) document.documentElement.dataset.pendingDraft = "true"
        return schedule(handler, delay === 400 ? 60_000 : delay, ...args)
      },
    })
    return null
  })
  await editor.fill("newest unsaved text")
  await expect(browser.locator("html")).toHaveAttribute("data-pending-draft", "true")
  await screen.getByRole("link", "Dashboard", { visible: true }).tap()
  await expect(browser).toHaveURL(/\/dashboard$/)
  await app.open("/new")
  await expect(screen.getByLabel("Contents of untitled.txt")).toHaveValue("newest unsaved text")
})
