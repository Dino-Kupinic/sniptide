import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { apiToken, oauthClient, onboarding } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { getDb } from "@/lib/db"
import {
  AGENT_CLIENTS,
  agentClientFromName,
  agentSetup,
  ONBOARDING_WINDOW_DAYS,
  preferencesForUseCase,
  SIGNUP_SOURCES,
  USE_CASES,
} from "@/lib/onboarding"
import {
  getAgentConnection,
  markTourSeen,
  saveSignupSource,
  saveUseCase,
} from "@/lib/onboarding-actions"
import { canOnboard, shouldOnboard, shouldStartTour } from "@/lib/onboarding-server"
import { changePreferences, readPreferences } from "@/lib/preference-store"
import { defaultPreferences } from "@/lib/preferences"
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

  test("the agents use case makes new pastes never expire, and another answer undoes it", async () => {
    await saveUseCase("agents")
    expect((await readPreferences("ada")).defaultExpiry).toBe("never")
    await saveUseCase("agents")
    expect((await readPreferences("ada")).defaultExpiry).toBe("never")
    await saveUseCase("sharing")
    expect((await readPreferences("ada")).defaultExpiry).toBe("1w")
  })

  test("the agents use case keeps an expiry chosen in Settings", async () => {
    await changePreferences("ada", (current) => ({ ...current, defaultExpiry: "1m" }))
    await saveUseCase("agents")
    expect((await readPreferences("ada")).defaultExpiry).toBe("1m")
    await saveUseCase("team")
    expect((await readPreferences("ada")).defaultExpiry).toBe("1m")
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

  test("the tour starts by itself once, after the wizard", async () => {
    const user = { id: "ada", createdAt: new Date() }
    // Still in the wizard: the dashboard isn't reachable yet.
    expect(await shouldStartTour(user)).toBe(false)
    await saveSignupSource("skipped")
    expect(await shouldStartTour(user)).toBe(true)

    expect(await markTourSeen()).toEqual({ ok: true })
    expect(await shouldStartTour(user)).toBe(false)
    const [first] = await getDb().select().from(onboarding).where(eq(onboarding.userId, "ada"))
    expect(first?.tourSeenAt).toBeInstanceOf(Date)

    // A replay from the account menu keeps the first time.
    expect(await markTourSeen()).toEqual({ ok: true })
    const [second] = await getDb().select().from(onboarding).where(eq(onboarding.userId, "ada"))
    expect(second?.tourSeenAt).toEqual(first?.tourSeenAt)
  })

  test("an older account and a signed-out request never get the tour unasked", async () => {
    await saveSignupSource("x")
    const old = { id: "ada", createdAt: new Date(Date.now() - (ONBOARDING_WINDOW_DAYS + 1) * DAY) }
    expect(await shouldStartTour(old)).toBe(false)

    signInAs(null)
    expect((await markTourSeen()).ok).toBe(false)
    expect(await shouldStartTour({ id: "ada", createdAt: new Date() })).toBe(true)
  })

  test("deleting the account removes the answers", async () => {
    await saveSignupSource("x")
    await resetDatabase()
    expect(await stored()).toBeUndefined()
  })
})

describe("paste defaults for a use case", () => {
  const shipped = defaultPreferences

  test("agents turns the shipped expiry into never", () => {
    expect(preferencesForUseCase(shipped, null, "agents").defaultExpiry).toBe("never")
    expect(preferencesForUseCase(shipped, "sharing", "agents").defaultExpiry).toBe("never")
  })

  test("other use cases keep the shipped defaults", () => {
    for (const useCase of USE_CASES.filter((value) => value !== "agents")) {
      expect(preferencesForUseCase(shipped, null, useCase)).toBe(shipped)
    }
  })

  test("a chosen expiry stays when the answer is agents", () => {
    const chosen = { ...shipped, defaultExpiry: "1d" as const }
    expect(preferencesForUseCase(chosen, null, "agents")).toBe(chosen)
  })

  test("leaving agents puts the shipped expiry back, but only from never", () => {
    const never = { ...shipped, defaultExpiry: "never" as const }
    expect(preferencesForUseCase(never, "agents", "team").defaultExpiry).toBe("1w")
    const chosen = { ...shipped, defaultExpiry: "1y" as const }
    expect(preferencesForUseCase(chosen, "agents", "team")).toBe(chosen)
    expect(preferencesForUseCase(never, "sharing", "team")).toBe(never)
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
    expect(setup.grokBotLink).toBe("https://grok.com/connectors")
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
    expect(agentClientFromName("Grok Bot")).toBe("grok_bot")
    expect(agentClientFromName("xAI Connectors")).toBe("grok_bot")
    expect(agentClientFromName("Maxai")).toBe("other")
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
