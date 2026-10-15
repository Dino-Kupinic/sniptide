import { randomUUID } from "node:crypto"
import { expect } from "e2e"
import { test } from "./fixtures"

test("public paste links serve crawler metadata and an uncached code image", async ({
  app,
  browser,
  screen,
}) => {
  const title = `Preview snippet ${randomUUID()}`
  await app.open("/new")
  await screen.getByLabel("Title").fill(title)
  await screen.getByLabel("Contents of untitled.txt").fill("const answer = 42")
  await screen.getByRole("radio", "Public", { visible: true }).check()
  await screen.getByRole("button", /^Create paste/).tap()
  await expect(browser).toHaveURL(/\/pastes\/[^/]+$/)
  const slug = new URL(await browser.url()).pathname.split("/").at(-1)
  await app.clearState()
  await app.open(`/${slug}`)
  await expect(screen.getByRole("heading", title)).toBeVisible()

  for (const userAgent of ["Slackbot-LinkExpanding 1.0", "Discordbot/2.0", "Twitterbot/1.0"]) {
    const response = await fetch(new URL(`/${slug}`, app.baseUrl), {
      headers: { "User-Agent": userAgent },
    })
    expect(response.status).toBe(200)
    const html = await response.text()
    const head = html.split("</head>")[0] ?? ""
    expect(head).toContain('property="og:image"')
    expect(head).toContain(`/${slug}/preview`)
    expect(head).toContain('name="twitter:card" content="summary_large_image"')
  }
  const image = await fetch(new URL(`/${slug}/preview`, app.baseUrl))
  expect(image.status).toBe(200)
  expect(image.headers.get("content-type")).toBe("image/png")
  expect(image.headers.get("cache-control")).toBe("no-store")
  expect([...new Uint8Array(await image.arrayBuffer()).slice(0, 8)]).toEqual([
    137, 80, 78, 71, 13, 10, 26, 10,
  ])
})
