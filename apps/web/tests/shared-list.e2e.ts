import { randomUUID } from "node:crypto"
import { createDb } from "@workspace/db"
import { paste, pasteFile, pasteShare, user } from "@workspace/db/schema"
import { eq, inArray } from "drizzle-orm"
import { expect } from "e2e"
import { databaseUrl } from "./environment"
import { test } from "./fixtures"

test("shared pagination and filters survive URL navigation and reload", async ({
  account,
  app,
  browser,
  screen,
}) => {
  const db = createDb(databaseUrl())
  const firstOwner = randomUUID()
  const secondOwner = randomUUID()
  const owners = [firstOwner, secondOwner]
  try {
    const [viewer] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, account.email))
    if (!viewer) throw new Error("Shared-list fixture requires the signed-in account.")
    await db
      .insert(user)
      .values(owners.map((id) => ({ id, name: `Owner ${id}`, email: `${id}@example.test` })))
    for (let i = 0; i < 21; i++) {
      const id = randomUUID()
      await db.insert(paste).values({
        id,
        slug: id,
        ownerId: i < 20 ? firstOwner : secondOwner,
        title: `Shared fixture ${String(i).padStart(2, "0")}`,
        visibility: "private",
      })
      await db.insert(pasteFile).values({
        pasteId: id,
        position: 0,
        name: "fixture.txt",
        language: i === 20 ? "typescript" : "text",
        content: "shared fixture",
      })
      await db.insert(pasteShare).values({
        pasteId: id,
        userId: viewer.id,
        access: i === 20 ? "edit" : "view",
        createdAt: new Date(Date.UTC(2026, 0, 1) + i * 1000),
      })
    }
    await app.open("/shared?sort=title")
    await expect(screen.getByText("21 pastes from 2 people")).toBeVisible()
    await expect(
      screen.getByRole("link", "Shared fixture 00", { exact: true, visible: true }),
    ).toBeVisible()
    await expect(
      screen.getByRole("link", "Shared fixture 10", { exact: true, visible: true }),
    ).not.toBeVisible()
    await screen.getByRole("button", "Next page").tap()
    await expect(browser).toHaveURL(/sort=title&page=2$/)
    await expect(
      screen.getByRole("link", "Shared fixture 10", { exact: true, visible: true }),
    ).toBeVisible()
    await screen.getByRole("searchbox", { visible: true }).fill("Shared fixture 20")
    await expect(browser).toHaveURL(/q=Shared\+fixture\+20&sort=title$/)
    await expect(screen.getByText("1 paste from 1 person")).toBeVisible()
    await expect(
      screen.getByRole("link", "Shared fixture 20", { exact: true, visible: true }),
    ).toBeVisible()
    await app.open(`/shared?language=typescript&owner=${secondOwner}&access=edit&sort=updated`)
    await expect(
      screen.getByRole("link", "Shared fixture 20", { exact: true, visible: true }),
    ).toBeVisible()
    await app.open(await browser.url())
    await expect(screen.getByText("1 paste from 1 person")).toBeVisible()
    await app.open("/shared?q=no-shared-matches")
    await expect(screen.getByText("No pastes match these filters.")).toBeVisible()
  } finally {
    await db.delete(user).where(inArray(user.id, owners))
    await db.$client.end()
  }
})
