import { randomUUID } from "node:crypto"
import type { Browser } from "@e2e-dev/web"
import { ENVELOPE_PATTERN, KEY_PATTERN } from "@sniptide/contracts/encryption"
import { createDb } from "@workspace/db"
import { paste, pasteFile, pasteRevision } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import type { App, Screen } from "e2e"
import { expect } from "e2e"
import { databaseUrl } from "./environment"
import { test } from "./fixtures"

// Everything the database holds for a paste, as one string, to search for leaked plaintext.
async function storedText(slug: string) {
  const db = createDb(databaseUrl())
  try {
    const [record] = await db.select().from(paste).where(eq(paste.slug, slug))
    if (!record) throw new Error(`No paste at ${slug}.`)
    const files = await db.select().from(pasteFile).where(eq(pasteFile.pasteId, record.id))
    const revisions = await db
      .select()
      .from(pasteRevision)
      .where(eq(pasteRevision.pasteId, record.id))
    return { record, files, text: JSON.stringify({ record, files, revisions }) }
  } finally {
    await db.$client.end()
  }
}

async function createEncrypted(
  app: App,
  browser: Browser,
  screen: Screen,
  input: { title: string; description: string; content: string; burn?: boolean },
) {
  await app.open("/new")
  await screen.getByLabel("Title").fill(input.title)
  await screen.getByLabel("Description").fill(input.description)
  await screen.getByLabel("Contents of untitled.txt").fill(input.content)
  await screen.getByRole("button", "Protection").tap()
  await screen.getByRole("switch", "End-to-end encryption").check()
  if (input.burn) await screen.getByRole("switch", "Burn after reading").check()
  await screen.getByRole("button", /^Create paste/).tap()
  await expect(browser).toHaveURL(/\/pastes\/[^/#]+$/)
  const slug = new URL(await browser.url()).pathname.split("/").at(-1) ?? ""
  // The key never left the browser; its key ring is the only place to read it from.
  const key = await browser.evaluate(() =>
    String(Object.values(JSON.parse(localStorage.getItem("sniptide.e2e.keys") ?? "{}"))[0]),
  )
  if (typeof key !== "string" || !KEY_PATTERN.test(key)) throw new Error("No key was remembered.")
  return { slug, key }
}

test("an encrypted paste reaches the server as ciphertext and opens only with its key", async ({
  app,
  browser,
  screen,
  account: _account,
}) => {
  const marker = randomUUID()
  const title = `Encrypted snippet ${marker}`
  const description = `described ${marker}`
  const content = `secret browser fixture ${marker}`
  const { slug, key } = await createEncrypted(app, browser, screen, {
    title,
    description,
    content,
  })

  // The owner's own page decrypts with the remembered key and offers no edit or duplicate.
  await expect(screen.getByText(content)).toBeVisible()
  await expect(screen.getByText(description)).toBeVisible()
  await expect(screen.getByRole("button", "Edit", { visible: true })).toHaveCount(0)

  // What the server stored: one envelope and nothing readable but the title.
  const stored = await storedText(slug)
  expect(stored.record.encryptionKeyId).toBeTruthy()
  expect(stored.record.description).toBe("")
  expect(stored.files.map((file) => file.name)).toEqual(["encrypted"])
  expect(stored.files[0]?.content).toMatch(ENVELOPE_PATTERN)
  for (const secret of [content, description, "untitled.txt", key]) {
    expect(stored.text).not.toContain(secret)
  }

  // What the server sends an anonymous reader: no plaintext, with or without the key in the link,
  // because a fragment is never part of the request.
  const html = await (await fetch(new URL(`/${slug}`, app.baseUrl))).text()
  for (const secret of [content, description, "untitled.txt", key]) {
    expect(html).not.toContain(secret)
  }
  expect((await fetch(new URL(`/${slug}/raw`, app.baseUrl))).status).toBe(403)
  expect((await fetch(new URL(`/${slug}/embed`, app.baseUrl))).status).toBe(404)
  expect((await fetch(new URL(`/${slug}/preview`, app.baseUrl))).status).toBe(404)

  // A reader with the bare link is asked for the key, and a wrong one is refused.
  await app.clearState()
  await app.open(`/${slug}`)
  await expect(screen.getByRole("heading", "Key needed")).toBeVisible()
  await expect(browser.locator("body")).not.toContainText(content)
  await screen.getByLabel("Link or key").fill(`${key.slice(0, -1)}${key.endsWith("A") ? "B" : "A"}`)
  await screen.getByRole("button", "Decrypt").tap()
  await expect(screen.getByRole("alert").filter({ hasText: "key" })).toBeVisible()
  await expect(browser.locator("body")).not.toContainText(content)

  // Pasting the full link works, and so does opening it.
  await screen.getByLabel("Link or key").fill(`${app.baseUrl}/${slug}#key=${key}`)
  await screen.getByRole("button", "Decrypt").tap()
  await expect(screen.getByRole("heading", title)).toBeVisible()
  await expect(screen.getByText(content)).toBeVisible()

  await app.clearState()
  await app.open(`/${slug}#key=${key}`)
  await expect(screen.getByRole("heading", title)).toBeVisible()
  await expect(screen.getByText(content)).toBeVisible()
  await expect(screen.getByText("End-to-end encrypted")).toBeVisible()
  // The print view is rendered by the server, which has nothing to print.
  await expect(screen.getByRole("link", "Print")).toHaveCount(0)
  // A share page never keeps the key.
  expect(await browser.evaluate(() => localStorage.getItem("sniptide.e2e.keys"))).toBeNull()
})

test("an encrypted one-time paste checks the key before it burns", async ({
  app,
  browser,
  screen,
  account: _account,
}) => {
  const marker = randomUUID()
  const title = `Encrypted one-time snippet ${marker}`
  const content = `one-time secret fixture ${marker}`
  const { slug, key } = await createEncrypted(app, browser, screen, {
    title,
    description: "",
    content,
    burn: true,
  })

  // Without the key there is nothing to burn: the reveal button only appears once a key fits.
  await app.clearState()
  await app.open(`/${slug}`)
  await expect(screen.getByRole("heading", "Read once")).toBeVisible()
  await expect(screen.getByRole("button", "Open and burn")).toHaveCount(0)
  await screen.getByLabel("Link or key").fill("not a key")
  await screen.getByRole("button", "Check key").tap()
  await expect(screen.getByRole("alert").filter({ hasText: "key" })).toBeVisible()
  expect((await storedText(slug)).record.deletedAt).toBeNull()

  await screen.getByLabel("Link or key").fill(key)
  await screen.getByRole("button", "Check key").tap()
  await screen.getByRole("button", "Open and burn").tap()
  await expect(screen.getByRole("heading", title)).toBeVisible()
  await expect(screen.getByText(content)).toBeVisible()
  expect((await storedText(slug)).record.burnedAt).not.toBeNull()
  expect((await fetch(new URL(`/${slug}`, app.baseUrl))).status).toBe(404)
})
