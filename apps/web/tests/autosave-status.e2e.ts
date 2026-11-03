import { expect } from "e2e"
import { test } from "./fixtures"

for (const width of [1280, 390]) {
  test(`saved time updates live and resets after a successful save at ${width}px`, async ({
    app,
    browser,
    screen,
  }) => {
    await browser.setViewport({ width, height: 900 })
    await app.open("/new")
    await screen.getByLabel("Title").fill("Saved timestamp")
    await screen.getByLabel("Contents of untitled.txt").fill("original")
    await screen.getByRole("button", /^Create paste/).tap()
    await expect(browser).toHaveURL(/\/pastes\/[^/]+$/)
    await screen.getByRole("button", "Edit", { visible: true }).tap()

    // Speed up the display clock without waiting minutes or changing server timestamps.
    await browser.evaluate(() => {
      const schedule = window.setInterval.bind(window)
      window.setInterval = ((handler: TimerHandler, delay?: number, ...args: unknown[]) =>
        schedule(handler, delay === 10_000 ? 100 : delay, ...args)) as typeof window.setInterval
      return null
    })
    const editor = screen.getByLabel("Contents of untitled.txt")
    await editor.fill("first successful save")
    const status = screen.getByRole("status", { visible: true }).filter({ hasText: /^Saved / })
    await expect(status).toHaveText("Saved just now")
    const url = await browser.url()
    await browser.evaluate(() => {
      const OriginalDate = Date
      class LaterDate extends OriginalDate {
        constructor(value?: string | number) {
          super(value === undefined ? OriginalDate.now() + 120_000 : value)
        }
        static now() {
          return OriginalDate.now() + 120_000
        }
      }
      window.Date = LaterDate as DateConstructor
      return null
    })
    await expect(status).toHaveText("Saved 2 min ago")
    await expect(browser).toHaveURL(url)
    await editor.fill("second successful save")
    await expect(status).toHaveText("Saved just now")
  })
}
