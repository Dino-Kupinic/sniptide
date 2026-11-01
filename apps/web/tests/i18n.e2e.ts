import { test as anonymousTest } from "@e2e-dev/web"
import { expect } from "e2e"
import { test } from "./fixtures"

anonymousTest(
  "language selection translates sign-in and survives a reload",
  async ({ app, browser, screen }) => {
    await app.open("/sign-in")
    await browser.locator('input[name="email"]').fill("reader@example.test")

    // The menu button is named after the language label and the current language, both localized.
    let current = "Language: English"
    for (const [locale, name, button, heading] of [
      ["de", "Deutsch", "Sprache: Deutsch", "Bei Sniptide anmelden"],
      ["es", "Español", "Idioma: Español", "Inicia sesión en Sniptide"],
      ["zh", "简体中文", "语言: 简体中文", "登录 Sniptide"],
      ["ja", "日本語", "言語: 日本語", "Sniptide にサインイン"],
      ["en", "English", "Language: English", "Sign in to Sniptide"],
    ] as const) {
      await screen.getByRole("button", current).tap()
      await screen.getByRole("menuitemradio", name, { exact: true }).tap()
      await expect(screen.getByRole("heading", heading)).toBeVisible()
      await expect(browser.locator("html")).toHaveAttribute("lang", locale)
      await expect(browser.locator('input[name="email"]')).toHaveValue("reader@example.test")
      await browser.reload()
      await expect(screen.getByRole("heading", heading)).toBeVisible()
      await expect(screen.getByRole("button", button)).toBeVisible()
      await browser.locator('input[name="email"]').fill("reader@example.test")
      current = button
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
