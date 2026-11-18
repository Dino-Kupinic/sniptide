import { randomUUID } from "node:crypto"
import { createDb } from "@workspace/db"
import { paste, pasteFile, pasteShare, pasteStar, user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { expect } from "e2e"
import { formatDateTime } from "../lib/format"
import { databaseUrl } from "./environment"
import { test } from "./fixtures"

async function seedOwned(email: string, expiresAt: Date) {
  const db = createDb(databaseUrl())
  const slug = randomUUID()
  const title = `Expiry fixture ${slug}`
  try {
    const [owner] = await db.select({ id: user.id }).from(user).where(eq(user.email, email))
    if (!owner) throw new Error("Expiry fixture requires the signed-in account.")
    await db
      .insert(paste)
      .values({ id: slug, slug, ownerId: owner.id, title, visibility: "unlisted", expiresAt })
    await db.insert(pasteFile).values({
      pasteId: slug,
      position: 0,
      name: "expiry.txt",
      language: "text",
      content: "owner can still copy this code",
    })
    await db.insert(pasteStar).values({ pasteId: slug, userId: owner.id })
    return { slug, title }
  } finally {
    await db.$client.end()
  }
}

for (const width of [1280, 390]) {
  test(`expiry stays selected across autosaves at ${width}px`, async ({
    account,
    app,
    browser,
    screen,
  }) => {
    await browser.setViewport({ width, height: 900 })
    const originalExpiry = new Date(Date.now() + 60_000)
    const { slug } = await seedOwned(account.email, originalExpiry)
    const db = createDb(databaseUrl())
    const releaseSave = Promise.withResolvers<void>()
    try {
      async function savedPaste() {
        const [row] = await db
          .select({ expiresAt: paste.expiresAt, title: paste.title, version: paste.version })
          .from(paste)
          .where(eq(paste.id, slug))
        if (!row) throw new Error("Missing expiry fixture.")
        return row
      }

      const settings = screen.getByRole("button", /^Paste settings/, { visible: true })
      const sheet = screen.getByRole("dialog", "Paste settings", { visible: true })
      const slider = screen.getByRole("slider", "Expires after", { visible: true })
      await app.open(`/pastes/${slug}/edit`)
      if (width === 390) await settings.tap()
      await slider.press("ArrowRight")
      await expect
        .poll(async () => (await savedPaste()).expiresAt?.getTime())
        .toBeGreaterThan(originalExpiry.getTime())
      const renewedExpiry = (await savedPaste()).expiresAt
      if (!renewedExpiry) throw new Error("Missing saved expiry.")
      await expect(
        screen.getByText(`Currently expires ${formatDateTime(renewedExpiry.getTime())}.`, {
          visible: true,
        }),
      ).toBeVisible()
      await expect(slider).toHaveAttribute("aria-valuetext", "1h")

      if (width === 390) await sheet.getByRole("button", "Done", { exact: true }).tap()
      await screen.getByLabel("Title").fill("Edited after setting expiry")
      await expect.poll(async () => (await savedPaste()).title).toBe("Edited after setting expiry")
      expect((await savedPaste()).expiresAt).toEqual(renewedExpiry)

      if (width === 390) await settings.tap()
      await expect(slider).toHaveAttribute("aria-valuetext", "1h")

      // Reselect the same duration while its first save is still in flight.
      let held = false
      await browser.route(`**/pastes/${slug}/edit`, async (route) => {
        if (!held && route.request.method === "POST") {
          held = true
          await releaseSave.promise
        }
        await route.continue()
      })
      const version = (await savedPaste()).version
      await slider.press("ArrowRight")
      await expect.poll(() => held).toBe(true)
      await slider.press("ArrowRight")
      await slider.press("ArrowLeft")
      releaseSave.resolve()
      await expect.poll(async () => (await savedPaste()).version).toBe(version + 2)
      await expect(slider).toHaveAttribute("aria-valuetext", "1d")

      await slider.press("End")
      await expect(screen.getByText("Currently never expires.", { visible: true })).toBeVisible()
      await expect(slider).toHaveAttribute("aria-valuetext", "Never")
      expect((await savedPaste()).expiresAt).toBeNull()
    } finally {
      releaseSave.resolve()
      await db.$client.end()
    }
  })
}

for (const mobile of [false, true]) {
  test(`expired paste shows its status and can be renewed on ${mobile ? "mobile" : "desktop"}`, async ({
    account,
    app,
    browser,
    screen,
  }) => {
    if (mobile) await browser.setViewport({ width: 390, height: 844 })
    const { slug, title } = await seedOwned(account.email, new Date(Date.now() - 60_000))
    await app.open("/pastes")
    const row = mobile
      ? screen.getByRole("listitem").filter({ hasText: title })
      : screen.getByRole("row").filter({ hasText: title })
    await expect(row.getByText("Expired", { exact: true })).toBeVisible()
    await row.getByRole("button", `Actions for ${title}`).tap()
    await expect(
      screen.getByRole(mobile ? "button" : "menuitem", "Copy link", { exact: true, visible: true }),
    ).toBeDisabled()
    await app.open("/starred")
    const starredRow = mobile
      ? screen.getByRole("listitem").filter({ hasText: title })
      : screen.getByRole("row").filter({ hasText: title })
    await expect(starredRow.getByText("Expired", { exact: true })).toBeVisible()
    await app.open(`/pastes/${slug}`)
    await expect(screen.getByRole("heading", title, { level: 1 })).toBeVisible()
    await expect(screen.getByText("Expired", { exact: true, visible: true })).toBeVisible()
    await expect(screen.getByRole("button", "Share", { exact: true, visible: true })).toBeDisabled()
    await expect(
      screen.getByText(
        "This paste has expired. Set a new expiry or choose Never to share it again.",
        { exact: true, visible: true },
      ),
    ).toBeVisible()
    if (mobile) {
      await expect(screen.getByRole("button", "Copy code", { visible: true })).toBeEnabled()
      await screen.getByRole("button", "More actions", { visible: true }).tap()
      await expect(screen.getByRole("menuitem", "Copy link", { exact: true })).toBeDisabled()
      await browser.keyboard.press("Escape")
    } else {
      await expect(
        screen.getByRole("button", "Copy link", { exact: true, visible: true }),
      ).toBeDisabled()
    }
    if (!mobile) await screen.getByRole("button", "Access", { exact: true }).tap()
    await screen.getByRole("button", "Expires", { exact: true, visible: true }).tap()
    await screen.getByRole("menuitem", "Never", { exact: true }).tap()
    await expect(screen.getByRole("button", "Share", { exact: true, visible: true })).toBeEnabled()
    await expect(screen.getByText("Expired", { exact: true, visible: true })).not.toBeVisible()
    if (!mobile)
      await expect(
        screen.getByRole("button", "Copy link", { exact: true, visible: true }),
      ).toBeEnabled()
  })
}

test("an owner can revoke existing access after expiry", async ({ account, app, screen }) => {
  const { slug } = await seedOwned(account.email, new Date(Date.now() - 60_000))
  const db = createDb(databaseUrl())
  const readerId = randomUUID()
  try {
    await db
      .insert(user)
      .values({ id: readerId, name: "Expired reader", email: `${readerId}@example.test` })
    await db.insert(pasteShare).values({ pasteId: slug, userId: readerId, access: "view" })
    await app.open(`/pastes/${slug}`)
    await screen.getByRole("button", "Manage access", { exact: true, visible: true }).tap()
    const dialog = screen.getByRole("dialog", { visible: true })
    await expect(dialog.getByRole("textbox", "Email or username")).toBeDisabled()
    await dialog.getByRole("button", "Access for Expired reader").tap()
    await expect(screen.getByRole("menuitem", "Can edit", { exact: true })).toBeDisabled()
    await screen.getByRole("menuitem", "Remove access", { exact: true }).tap()
    await expect(dialog.getByText("Expired reader", { exact: true })).not.toBeVisible()
    await expect(screen.getByRole("button", "Undo", { exact: true })).not.toBeVisible()
    expect(await db.select().from(pasteShare).where(eq(pasteShare.pasteId, slug))).toEqual([])
  } finally {
    await db.delete(user).where(eq(user.id, readerId))
    await db.$client.end()
  }
})

test("an open Share dialog stops distributing a link when its deadline passes", {
  timeout: 60_000,
}, async ({ account, app, screen }) => {
  const { slug } = await seedOwned(account.email, new Date(Date.now() + 20_000))
  await app.open(`/pastes/${slug}`)
  await screen.getByRole("button", "Share", { exact: true, visible: true }).tap()
  const dialog = screen.getByRole("dialog", { visible: true })
  const copy = dialog.getByRole("button", "Copy", { exact: true }).first()
  await expect(copy).toBeEnabled()
  await expect(copy).toBeDisabled({ timeout: 30_000 })
  await expect(dialog.getByRole("textbox", "Email or username")).toBeDisabled()
  await expect(dialog.getByRole("status")).toContainText("This paste has expired.")
  await dialog.getByRole("button", "Close", { exact: true }).tap()
  await expect(screen.getByRole("button", "Share", { exact: true, visible: true })).toBeDisabled()
})
