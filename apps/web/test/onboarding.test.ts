import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { apiToken, oauthClient, onboarding } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { getDb } from "@/lib/db"
import {
  AGENT_CLIENTS,
  agentClientFromName,
  agentSetup,
  ONBOARDING_WINDOW_DAYS,
  SIGNUP_SOURCES,
  USE_CASES,
} from "@/lib/onboarding"
import { getAgentConnection, saveSignupSource, saveUseCase } from "@/lib/onboarding-actions"
import { canOnboard, shouldOnboard } from "@/lib/onboarding-server"
import { DAY } from "@/lib/time"
import { hasDatabase, resetDatabase, seedUser, signInAs } from "./harness"

const describeDb = hasDatabase ? describe : describe.skip

async function stored(userId = "ada") {
  const [row] = await getDb().select().from(onboarding).where(eq(onboarding.userId, userId))
  return row ? { source: row.source, useCase: row.useCase } : undefined
}

describeDb("onboarding answers", () => {
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("ada")
    signInAs("ada")
  })
  afterAll(resetDatabase)

  test("stores the source once and keeps the first answer", async () => {
    expect(await saveSignupSource("hacker_news")).toEqual({ ok: true })
    expect(await saveSignupSource("reddit")).toEqual({ ok: true })
    expect(await stored()).toEqual({ source: "hacker_news", useCase: null })
  })

  test("a later use case replaces an earlier one and keeps the source", async () => {
    await saveSignupSource("x")
    expect(await saveUseCase("sharing")).toEqual({ ok: true })
    expect(await saveUseCase("agents")).toEqual({ ok: true })
    expect(await stored()).toEqual({ source: "x", useCase: "agents" })
  })

  test("a use case without a source records the source as skipped", async () => {
    await saveUseCase("team")
    expect(await stored()).toEqual({ source: "skipped", useCase: "team" })
  })

  test("answering or skipping the first step ends the redirect", async () => {
    const user = { id: "ada", createdAt: new Date() }
    expect(await shouldOnboard(user)).toBe(true)
    expect(await saveSignupSource("skipped")).toEqual({ ok: true })
    expect(await stored()).toEqual({ source: "skipped", useCase: null })
    expect(await shouldOnboard(user)).toBe(false)
  })

  test("rejects answers outside the lists and signed-out requests", async () => {
    expect((await saveSignupSource("a friend of a friend")).ok).toBe(false)
    expect((await saveSignupSource("")).ok).toBe(false)
    expect((await saveUseCase("skipped")).ok).toBe(false)
    expect(await stored()).toBeUndefined()

    signInAs(null)
    expect((await saveSignupSource("reddit")).ok).toBe(false)
    expect((await saveUseCase("agents")).ok).toBe(false)
    expect(await stored()).toBeUndefined()
  })

  test("reports the newest OAuth connection by client, and ignores personal tokens", async () => {
    expect(await getAgentConnection()).toBeNull()
    await getDb()
      .insert(apiToken)
      .values({ ownerId: "ada", name: "CLI", prefix: "snpt_a", hash: "a", scopes: ["read"] })
    expect(await getAgentConnection()).toBeNull()

    await getDb()
      .insert(oauthClient)
      .values({ id: "sntc_test", name: "Claude Code", redirectUris: ["http://localhost/cb"] })
    await getDb()
      .insert(apiToken)
      .values({
        ownerId: "ada",
        name: "Claude Code",
        prefix: "snpt_b",
        hash: "b",
        scopes: ["read", "write"],
        clientId: "sntc_test",
      })
    expect(await getAgentConnection()).toEqual({ client: "claude_code" })

    signInAs(null)
    expect(await getAgentConnection()).toBeNull()
  })

  test("deleting the account removes the answers", async () => {
    await saveSignupSource("x")
    await resetDatabase()
    expect(await stored()).toBeUndefined()
  })
})

describe("onboarding", () => {
  test("only recent accounts are onboarded", () => {
    const now = new Date("2026-11-20T12:00:00Z")
    const age = (days: number) => ({ id: "ada", createdAt: new Date(now.getTime() - days * DAY) })
    expect(canOnboard(age(0), now)).toBe(true)
    expect(canOnboard(age(ONBOARDING_WINDOW_DAYS - 1), now)).toBe(true)
    expect(canOnboard(age(ONBOARDING_WINDOW_DAYS + 1), now)).toBe(false)
  })

  test("agent setup points every client at the instance's MCP server", () => {
    const setup = agentSetup("https://app.sniptide.com")
    expect(setup.url).toBe("https://app.sniptide.com/api/mcp")
    expect(setup.claudeCode).toBe(
      "claude mcp add --transport http sniptide https://app.sniptide.com/api/mcp",
    )
    expect(setup.codex).toBe("codex mcp add sniptide --url https://app.sniptide.com/api/mcp")
    const link = new URL(setup.cursorLink)
    expect(link.protocol).toBe("cursor:")
    expect(link.searchParams.get("name")).toBe("sniptide")
    expect(JSON.parse(atob(link.searchParams.get("config") ?? ""))).toEqual({
      url: "https://app.sniptide.com/api/mcp",
    })
  })

  test("a connection's client name maps onto the fixed list", () => {
    expect(agentClientFromName("Claude Code (sniptide)")).toBe("claude_code")
    expect(agentClientFromName("Codex")).toBe("codex")
    expect(agentClientFromName("Cursor")).toBe("cursor")
    expect(agentClientFromName("<script>")).toBe("other")
  })

  test("every answer has a label in each language", async () => {
    for (const locale of ["en", "de", "es", "ja", "zh"]) {
      const messages = (await import(`@/messages/${locale}/onboarding.json`)).default.Onboarding
      for (const source of SIGNUP_SOURCES) expect(messages.source.options[source]).toBeTruthy()
      for (const useCase of USE_CASES) expect(messages.useCase.options[useCase]).toBeTruthy()
      for (const client of AGENT_CLIENTS) expect(messages.agent.clients[client]).toBeTruthy()
    }
  })
})
