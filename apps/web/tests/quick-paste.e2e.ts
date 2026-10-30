import { randomUUID } from "node:crypto"
import { createAuth } from "@workspace/auth"
import { createDb } from "@workspace/db"
import { user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { expect } from "e2e"
import { databaseUrl } from "./environment"
import { test } from "./fixtures"

test("refreshing server defaults preserves quick draft edits that are not stored yet", async ({
  account,
  app,
  browser,
  screen,
}) => {
  await app.open("/dashboard")
  const code = screen.getByLabel("Code")
  await code.fill("stored draft")
  await code.press("Control+s")
  await browser.evaluate(() => {
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("sniptide:quick-paste:")) return
      setItem.call(this, key, value)
    }
    return null
  })
  await code.fill("latest unsaved draft")
  await screen.getByRole("button", new RegExp(account.email.split("@")[0] ?? "")).tap()
  await screen.getByRole("menuitem", "Language", { exact: true }).tap()
  await screen.getByRole("menuitemradio", "Deutsch", { exact: true }).tap()
  await expect(screen.getByRole("heading", "Schneller Paste")).toBeVisible()
  await expect(code).toHaveValue("latest unsaved draft")
})

test("the visible quick draft matches current input while highlighting catches up", async ({
  app,
  browser,
  screen,
}) => {
  await app.open("/dashboard")
  const code = screen.getByLabel("Code")
  await code.fill("const answer: number = 42")
  await expect
    .poll(() =>
      browser
        .locator('section[aria-labelledby="quick-paste-heading"] [aria-hidden="true"] span')
        .count(),
    )
    .toBeGreaterThan(0)
  await browser.evaluate(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Code"]')
    const parent = textarea?.parentElement
    const layer = parent?.querySelector('[aria-hidden="true"] > div')
    if (!textarea || !parent || !layer) throw new Error("The quick draft editor is missing")
    const snapshots: { value: string; overlay: string }[] = []
    const observer = new MutationObserver(() => {
      snapshots.push({
        value: textarea.value,
        overlay: Array.from(layer.children, (line) => line.textContent).join("\n"),
      })
    })
    observer.observe(parent, { childList: true, characterData: true, subtree: true })
    Object.assign(window, {
      finishHighlightCheck: () => {
        observer.disconnect()
        return snapshots
      },
    })
    return null
  })
  const latest = "const answer: number = 43;\nconsole.log(answer)"
  await code.fill(latest)
  await expect
    .poll(() =>
      browser.evaluate(() => {
        const textarea = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Code"]')
        const layer = textarea?.parentElement?.querySelector('[aria-hidden="true"] > div')
        return {
          overlay: layer ? Array.from(layer.children, (line) => line.textContent).join("\n") : null,
          highlighted: Boolean(layer?.querySelector("span")),
        }
      }),
    )
    .toEqual({ overlay: latest, highlighted: true })
  const snapshots = await browser.evaluate(() =>
    (
      window as typeof window & {
        finishHighlightCheck(): { value: string; overlay: string }[]
      }
    ).finishHighlightCheck(),
  )
  expect(snapshots.length).toBeGreaterThan(0)
  expect(snapshots.every(({ value, overlay }) => value === overlay)).toBe(true)
})

test("quick drafts stay with their account when the browser changes accounts", async ({
  app,
  browser,
  screen,
}) => {
  await app.open("/dashboard")
  const accountCookies = await browser.cookies()
  const code = screen.getByLabel("Code")
  await code.fill("account A private draft")
  await code.press("Control+s")

  const db = createDb(databaseUrl())
  const username = `e2e-${randomUUID().slice(0, 16)}`
  const email = `${username}@example.test`
  try {
    const auth = createAuth({
      db,
      secret: process.env.E2E_AUTH_SECRET ?? "",
      baseURL: app.baseUrl,
      rateLimitEnabled: false,
    })
    const response = await auth.api.signUpEmail({
      body: { name: username, username, email, password: process.env.E2E_ACCOUNT_PASSWORD ?? "" },
      asResponse: true,
    })
    expect(response.status).toBe(200)
    await browser.setCookies(
      response.headers.getSetCookie().map((header) => {
        const pair = header.split(";")[0] ?? ""
        const separator = pair.indexOf("=")
        return {
          url: app.baseUrl ?? "",
          name: pair.slice(0, separator),
          value: pair.slice(separator + 1),
        }
      }),
    )
    await app.open("/dashboard")
    await expect(code).toHaveValue("")
    await code.fill("account B private draft")
    await code.press("Control+s")
    await browser.setCookies(accountCookies)
    await app.open("/dashboard")
    await expect(code).toHaveValue("account A private draft")
  } finally {
    await db.delete(user).where(eq(user.email, email))
    await db.$client.end()
  }
})

test("an unowned legacy quick draft is never adopted by the current account", async ({
  app,
  browser,
  screen,
}) => {
  await app.open("/dashboard")
  await browser.evaluate(() => {
    localStorage.setItem(
      "sniptide:quick-paste",
      JSON.stringify({ content: "unowned browser secret", name: "secret.env" }),
    )
    return null
  })
  await app.open("/dashboard")
  await expect(screen.getByLabel("Code")).toHaveValue("")
})
