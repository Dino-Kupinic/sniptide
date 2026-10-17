import { test as anonymousTest } from "@e2e-dev/web"
import { expect } from "e2e"
import { test } from "./fixtures"

anonymousTest(
  "language selection translates sign-in and survives a reload",
  async ({ app, browser, screen }) => {
    await app.open("/sign-in")
    await browser.locator('input[name="email"]').fill("reader@example.test")

    for (const [locale, heading] of [
      ["de", "Willkommen zurück"],
      ["es", "Te damos la bienvenida de nuevo"],
      ["zh", "欢迎回来"],
      ["ja", "おかえりなさい"],
      ["en", "Welcome back"],
    ] as const) {
      await screen.getByRole("combobox").selectOption({ value: locale })
      await expect(screen.getByRole("heading", heading)).toBeVisible()
      await expect(browser.locator("html")).toHaveAttribute("lang", locale)
      await expect(browser.locator('input[name="email"]')).toHaveValue("reader@example.test")
      await browser.reload()
      await expect(screen.getByRole("heading", heading)).toBeVisible()
      await expect(screen.getByRole("combobox")).toHaveValue(locale)
      await browser.locator('input[name="email"]').fill("reader@example.test")
    }
    await app.screenshot("sign-in-english")
  },
)

test("settings language applies to the editor and mobile share pages", async ({
  app,
  browser,
  screen,
}) => {
  await app.open("/settings")
  await screen.getByRole("combobox", "Language").selectOption({ value: "ja" })
  await expect(screen.getByRole("heading", "設定", { level: 1 })).toBeVisible()
  await app.open("/new")
  await expect(browser.locator("html")).toHaveAttribute("lang", "ja")
  await expect(screen.getByLabel("タイトル")).toBeVisible()

  await browser.setViewport({ width: 390, height: 844 })
  await app.open("/missing-localization-paste")
  await expect(browser.locator("html")).toHaveAttribute("lang", "ja")
  await expect(screen.getByRole("combobox")).toHaveValue("ja")
  expect(
    await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true)
  await app.screenshot("share-not-found-japanese-mobile")
})
