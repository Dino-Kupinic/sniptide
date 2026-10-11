import { randomUUID } from "node:crypto"
import type { App, Screen } from "e2e"
import { expect, secrets } from "e2e"
import { test } from "./fixtures"

async function draft(app: App, screen: Screen, title: string, content: string) {
  await app.open("/new")
  await screen.getByLabel("Title").fill(title)
  await screen.getByLabel("Contents of untitled.txt").fill(content)
}

test("create, edit, and share a snippet with an anonymous reader", async ({
  app,
  browser,
  screen,
}) => {
  const title = `Browser snippet ${randomUUID()}`
  await draft(app, screen, title, "original browser fixture")
  await screen.getByRole("button", /^Create paste/).tap()
  await expect(browser).toHaveURL(/\/pastes\/[^/]+$/)
  const slug = new URL(await browser.url()).pathname.split("/").at(-1)
  await screen.getByRole("button", "Edit", { visible: true }).tap()
  await expect(screen.getByLabel("Contents of untitled.txt")).toHaveValue(
    "original browser fixture",
  )
  await screen.getByLabel("Title").fill(`${title} edited`)
  await screen.getByLabel("Contents of untitled.txt").fill("edited browser fixture")
  await screen.getByRole("button", /^Save changes/).tap()
  await expect(browser).toHaveURL(`/pastes/${slug}`)
  await app.clearState()
  await app.open(`/${slug}`)
  await expect(screen.getByRole("heading", `${title} edited`)).toBeVisible()
  await expect(screen.getByText("edited browser fixture")).toBeVisible()
  const raw = await fetch(new URL(`/${slug}/raw`, app.baseUrl))
  expect(raw.status).toBe(200)
  expect(await raw.text()).toBe("edited browser fixture")
})

test("password protection hides content until unlocked and resets in a fresh session", async ({
  app,
  browser,
  screen,
}) => {
  const title = `Protected snippet ${randomUUID()}`
  const content = "protected browser fixture"
  await draft(app, screen, title, content)
  await screen.getByRole("button", "Protection").tap()
  await screen.getByRole("switch", "Password").check()
  await screen.getByLabel("Paste password", { visible: true }).fill(secrets.get("pastePassword"))
  await screen.getByRole("button", /^Create paste/).tap()
  await expect(browser).toHaveURL(/\/pastes\/[^/]+$/)
  const slug = new URL(await browser.url()).pathname.split("/").at(-1)
  await app.clearState()
  await app.open(`/${slug}`)
  await expect(screen.getByRole("heading", "Password needed")).toBeVisible()
  await expect(browser.locator("body")).not.toContainText(content)
  const raw = await fetch(new URL(`/${slug}/raw`, app.baseUrl))
  expect(raw.status).toBe(401)
  expect(await raw.text()).not.toContain(content)
  await screen.getByLabel("Password").fill(secrets.get("wrongPassword"))
  await screen.getByRole("button", "Unlock").tap()
  await expect(screen.getByRole("alert").filter({ hasText: "password" })).toBeVisible()
  await expect(browser.locator("body")).not.toContainText(content)
  await screen.getByLabel("Password").fill(secrets.get("pastePassword"))
  await screen.getByRole("button", "Unlock").tap()
  await expect(screen.getByRole("heading", title)).toBeVisible()
  await expect(screen.getByText(content)).toBeVisible()
  await app.clearState()
  await app.open(`/${slug}`)
  await expect(screen.getByRole("heading", "Password needed")).toBeVisible()
})

test("a one-time snippet reveals once and disappears on the next visit", async ({
  app,
  browser,
  screen,
}) => {
  const title = `One-time snippet ${randomUUID()}`
  const content = "one-time browser fixture"
  await draft(app, screen, title, content)
  await screen.getByRole("button", "Protection").tap()
  await screen.getByRole("switch", "Burn after reading").check()
  await screen.getByRole("button", /^Create paste/).tap()
  await expect(browser).toHaveURL(/\/pastes\/[^/]+$/)
  const slug = new URL(await browser.url()).pathname.split("/").at(-1)
  await app.clearState()
  await app.open(`/${slug}`)
  await expect(screen.getByRole("heading", "Read once")).toBeVisible()
  await expect(browser.locator("body")).not.toContainText(title)
  await expect(browser.locator("body")).not.toContainText(content)
  await screen.getByRole("button", "Open and burn").tap()
  await expect(screen.getByRole("heading", title)).toBeVisible()
  await expect(screen.getByText(content)).toBeVisible()
  await app.open(`/${slug}`)
  await expect(browser.locator("body")).not.toContainText(content)
  expect((await fetch(new URL(`/${slug}`, app.baseUrl))).status).toBe(404)
  expect((await fetch(new URL(`/${slug}/raw`, app.baseUrl))).status).toBe(404)
})

test("the mobile editor creates a shareable snippet", async ({ app, browser, screen }) => {
  await browser.setViewport({ width: 390, height: 844 })
  const title = `Mobile snippet ${randomUUID()}`
  await draft(app, screen, title, "mobile browser fixture")
  await screen.getByRole("button", "Create paste", { visible: true }).tap()
  await expect(browser).toHaveURL(/\/pastes\/[^/]+$/)
  const slug = new URL(await browser.url()).pathname.split("/").at(-1)
  await app.clearState()
  await app.open(`/${slug}`)
  await expect(screen.getByRole("heading", title)).toBeVisible()
  await expect(screen.getByText("mobile browser fixture")).toBeVisible()
})
