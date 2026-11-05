import { randomUUID } from "node:crypto"
import { createDb } from "@workspace/db"
import {
  apiToken,
  apiTokenUsageDay,
  oauthClient,
  paste,
  pasteFile,
  pasteStar,
  user,
} from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { expect } from "e2e"
import { WIDGETS, widgetSize } from "@/lib/dashboard/widgets"
import { DAY } from "@/lib/time"
import { databaseUrl } from "./environment"
import { test } from "./fixtures"

test("a new account starts from the Agents template", async ({ app, browser, screen }) => {
  await app.open("/dashboard")
  await expect(screen.getByRole("heading", "Connect an agent")).toBeVisible()
  await expect(screen.getByText(/^claude mcp add --transport http sniptide /)).toBeVisible()
  await expect(screen.getByRole("heading", "Recent pastes")).toBeVisible()
  await expect(screen.getByText(/^Pastes you and your agents create show up here\./)).toBeVisible()
  await expect(screen.getByRole("tablist", "Filter recent pastes")).toHaveCount(0)
  await expect(screen.getByRole("heading", "Agent activity")).toBeVisible()
  await expect(
    screen.getByText(/^Requests from your agents show up here once one connects/),
  ).toBeVisible()
  await expect(screen.getByRole("heading", "Agent pastes")).toBeVisible()
  // Figures and the chart moved to Analytics.
  await expect(screen.getByRole("radio", "7 days")).toHaveCount(0)
  await app.screenshot("dashboard-new-account")

  await screen.getByRole("link", "New paste", { visible: true }).first().tap()
  await expect(browser).toHaveURL(/\/new$/)
})

test("removing the agent widget can be undone and is saved", async ({ app, screen }) => {
  await app.open("/dashboard")
  await screen.getByRole("button", "Remove Agents from the dashboard").tap()
  await expect(screen.getByRole("heading", "Connect an agent")).toHaveCount(0)
  await expect(screen.getByText("Removed Agents from the dashboard")).toBeVisible()
  await screen.getByRole("button", "Undo").tap()
  await expect(screen.getByRole("heading", "Connect an agent")).toBeVisible()

  await screen.getByRole("button", "Remove Agents from the dashboard").tap()
  await expect(screen.getByRole("heading", "Connect an agent")).toHaveCount(0)
  await expect(screen.getByText("Removed Agents from the dashboard")).toBeVisible()
  await app.open("/dashboard")
  await expect(screen.getByRole("heading", "Recent pastes")).toBeVisible()
  await expect(screen.getByRole("heading", "Connect an agent")).toHaveCount(0)
})

test("customizing adds, reorders and clears widgets, and templates fill it again", async ({
  app,
  browser,
  screen,
}) => {
  await app.open("/dashboard")
  await screen.getByRole("button", "Customize").tap()
  await expect(screen.getByRole("button", "Move Agents")).toBeVisible()

  await screen.getByRole("button", "Add widget").tap()
  await screen.getByRole("menuitem", "Secrets").tap()
  await expect(screen.getByRole("heading", "Secrets")).toBeVisible()
  await expect(screen.getByText(/^No secret groups yet\./)).toBeVisible()

  const order = () =>
    browser.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("[data-widget]")].map(
        (node) => node.dataset.widget ?? "",
      ),
    )
  await expect
    .poll(order)
    .toEqual(["agents", "agent_activity", "agent_pastes", "recent_pastes", "secrets"])
  // The drag handle works from the keyboard: pick up, move one place up, drop.
  const handle = screen.getByRole("button", "Move Secrets")
  await handle.focus()
  await handle.press("Space")
  await handle.press("ArrowUp")
  await handle.press("Space")
  await expect
    .poll(order)
    .toEqual(["agents", "agent_activity", "agent_pastes", "secrets", "recent_pastes"])
  await app.screenshot("dashboard-customize")

  await screen.getByRole("button", "Templates").tap()
  await screen.getByRole("menuitem", "Blank").tap()
  await expect(screen.getByText(/^Your dashboard is empty\./)).toBeVisible()
  await screen.getByRole("button", "Done").tap()

  await app.open("/dashboard")
  await expect(screen.getByText(/^Your dashboard is empty\./)).toBeVisible()
  await screen.getByRole("button", "Sharing").tap()
  await expect(screen.getByRole("heading", "Most viewed")).toBeVisible()
  await expect(screen.getByRole("heading", "Expiring soon")).toBeVisible()
  await expect.poll(order).toEqual(["recent_pastes", "popular", "expiring"])
})

test("the dashboard fits a phone without horizontal scrolling", async ({
  app,
  browser,
  screen,
}) => {
  await browser.setViewport({ width: 360, height: 780 })
  await app.open("/dashboard")
  await expect(screen.getByRole("heading", "Connect an agent")).toBeVisible()
  expect(
    await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true)
  await app.screenshot("dashboard-phone")
  await screen.getByRole("button", "Customize").tap()
  await expect(screen.getByRole("button", "Move Agents")).toBeVisible()
  expect(
    await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true)
  await app.screenshot("dashboard-phone-customize")
})

test("every widget has saved small and large sizes and templates can undo sizes", async ({
  account,
  app,
  browser,
  screen,
}) => {
  const db = createDb(databaseUrl())
  const names = [
    "Agents",
    "Agent activity",
    "Agent pastes",
    "Recent pastes",
    "Starred",
    "Expiring soon",
    "Most viewed",
    "Secrets",
    "Collections",
  ]
  const savedSizes = async () => {
    const [owner] = await db
      .select({ preferences: user.preferences })
      .from(user)
      .where(eq(user.email, account.email))
    const sizes = JSON.parse(owner?.preferences ?? "{}").dashboardSizes ?? {}
    return Object.fromEntries(WIDGETS.map((widget) => [widget, widgetSize(widget, sizes)]))
  }
  const spans = () =>
    browser.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("[data-widget]")].map(
        (node) => getComputedStyle(node).gridColumnEnd,
      ),
    )
  try {
    await browser.setViewport({ width: 1280, height: 900 })
    await app.open("/dashboard")
    await screen.getByRole("button", "Customize").tap()
    for (const name of names.slice(4)) {
      await screen.getByRole("button", "Add widget").tap()
      await screen.getByRole("menuitem", name).tap()
    }
    for (const name of names) {
      await screen.getByRole("radiogroup", `Size of ${name}`).getByRole("radio", "Small").tap()
    }
    const small = Object.fromEntries(WIDGETS.map((widget) => [widget, "small"]))
    await expect.poll(savedSizes).toEqual(small)
    await expect.poll(spans).toEqual(WIDGETS.map(() => "auto"))
    expect(
      await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await app.screenshot("dashboard-all-small")
    await browser.reload()
    await screen.getByRole("button", "Customize").tap()
    for (const name of names) {
      await expect(
        screen.getByRole("radiogroup", `Size of ${name}`).getByRole("radio", "Small"),
      ).toBeChecked()
      await screen.getByRole("radiogroup", `Size of ${name}`).getByRole("radio", "Large").tap()
    }
    await expect
      .poll(savedSizes)
      .toEqual(Object.fromEntries(WIDGETS.map((widget) => [widget, "large"])))
    await expect.poll(spans).toEqual(WIDGETS.map(() => "span 2"))
    await browser.setViewport({ width: 360, height: 780 })
    await expect.poll(spans).toEqual(WIDGETS.map(() => "auto"))
    expect(
      await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await app.screenshot("dashboard-all-large-phone")
    await browser.setViewport({ width: 1280, height: 900 })
    await screen.getByRole("radiogroup", "Size of Agents").getByRole("radio", "Small").tap()
    await screen.getByRole("button", "Templates").tap()
    await screen.getByRole("menuitem", "Agents").tap()
    await expect(screen.getByText("Switched to the Agents template")).toBeVisible()
    await expect(
      screen.getByRole("radiogroup", "Size of Agents").getByRole("radio", "Large"),
    ).toBeChecked()
    await screen.getByRole("button", "Undo").tap()
    await expect(
      screen.getByRole("radiogroup", "Size of Agents").getByRole("radio", "Small"),
    ).toBeChecked()
    await expect(
      screen.getByRole("radiogroup", "Size of Collections").getByRole("radio", "Large"),
    ).toBeChecked()
    await browser.reload()
    await expect.poll(spans).toEqual(["auto", ...WIDGETS.slice(1).map(() => "span 2")])
  } finally {
    await db.$client.end()
  }
})

test("populated small widgets fit tables and agent activity into one column", async ({
  account,
  app,
  browser,
  screen,
}) => {
  const db = createDb(databaseUrl())
  const clientId = randomUUID()
  try {
    const [owner] = await db.select({ id: user.id }).from(user).where(eq(user.email, account.email))
    if (!owner) throw new Error("Dashboard fixture account is missing.")
    const sizes = Object.fromEntries(WIDGETS.map((widget) => [widget, "small"]))
    await db
      .update(user)
      .set({ preferences: JSON.stringify({ dashboard: [...WIDGETS], dashboardSizes: sizes }) })
      .where(eq(user.id, owner.id))
    await db
      .insert(oauthClient)
      .values({ id: clientId, name: "Codex", redirectUris: ["http://localhost/cb"] })
    const [token] = await db
      .insert(apiToken)
      .values({
        ownerId: owner.id,
        name: "Codex",
        prefix: "snpt_widget",
        hash: randomUUID(),
        scopes: ["read"],
        clientId,
      })
      .returning({ id: apiToken.id })
    if (!token) throw new Error("Dashboard fixture token is missing.")
    await db.insert(apiTokenUsageDay).values({
      ownerId: owner.id,
      tokenId: token.id,
      day: Math.floor(Date.now() / DAY),
      requests: 12,
    })
    const pasteId = randomUUID()
    await db.insert(paste).values({
      id: pasteId,
      slug: pasteId,
      ownerId: owner.id,
      title: "Widget sizing fixture",
      visibility: "unlisted",
      createdVia: "mcp",
      expiresAt: new Date(Date.now() + DAY),
      views: 12,
    })
    await db.insert(pasteFile).values({
      pasteId,
      position: 0,
      name: "fixture.ts",
      language: "typescript",
      content: "export const fixture = true",
    })
    await db.insert(pasteStar).values({ pasteId, userId: owner.id })
    await app.open("/dashboard")
    await expect(
      screen.getByText("Your agents made 12 requests in the last 14 days."),
    ).toBeVisible()
    await expect(screen.getByRole("table", { visible: true })).toHaveCount(0)
    for (const name of ["Agent pastes", "Recent pastes", "Starred"]) {
      await expect(screen.getByRole("region", name).getByRole("list")).toBeVisible()
      await expect(screen.getByRole("region", name).getByRole("list")).toContainText(
        "Widget sizing fixture",
      )
    }
    expect(
      await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await app.screenshot("dashboard-populated-small")
    await screen.getByRole("button", "Customize").tap()
    await screen.getByRole("radiogroup", "Size of Recent pastes").getByRole("radio", "Large").tap()
    await expect(screen.getByRole("table", { visible: true })).toHaveCount(1)
    await browser.setViewport({ width: 360, height: 780 })
    await expect(screen.getByRole("table", { visible: true })).toHaveCount(0)
    expect(
      await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await app.screenshot("dashboard-populated-phone")
  } finally {
    await db.delete(oauthClient).where(eq(oauthClient.id, clientId))
    await db.$client.end()
  }
})
