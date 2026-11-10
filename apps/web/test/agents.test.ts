import { afterAll, beforeEach, expect, test } from "bun:test"
import { apiToken, apiTokenUsageDay, oauthClient } from "@workspace/db/schema"
import { getConnectedAgents } from "@/lib/agent-actions"
import { AGENT_ACTIVITY_DAYS, agentActivity, listConnectedAgents } from "@/lib/agents"
import { getDb } from "@/lib/db"
import { DAY } from "@/lib/time"
import { hasDatabase, resetDatabase, seedUser, signInAs } from "./harness"

const testDb = hasDatabase ? test : test.skip

let tokens = 0
async function connect(
  owner: string,
  client: { id: string; name: string },
  token: { lastUsedAt?: Date; createdAt?: Date; refreshExpiresAt?: Date } = {},
) {
  await getDb()
    .insert(oauthClient)
    .values({ ...client, redirectUris: ["http://localhost/cb"] })
    .onConflictDoNothing()
  tokens++
  await getDb()
    .insert(apiToken)
    .values({
      ownerId: owner,
      name: client.name,
      prefix: `snpt_${tokens}`,
      hash: `hash-${tokens}`,
      scopes: ["read", "write"],
      clientId: client.id,
      ...token,
    })
}

beforeEach(async () => {
  if (!hasDatabase) return
  await resetDatabase()
  await seedUser("ada")
  await seedUser("bob")
  signInAs("ada")
})
afterAll(async () => {
  if (hasDatabase) await resetDatabase()
})

testDb("lists connected agents by name with their latest activity, newest first", async () => {
  const now = Date.now()
  expect(await listConnectedAgents("ada")).toEqual([])
  // A personal token from Settings is not an agent connection.
  await getDb()
    .insert(apiToken)
    .values({ ownerId: "ada", name: "CLI", prefix: "snpt_cli", hash: "cli", scopes: ["read"] })
  expect(await listConnectedAgents("ada")).toEqual([])

  const claude = { id: "sntc_claude", name: "Claude Code" }
  // Reconnecting registers a new client under the same name, so both grants count as one agent.
  const claudeAgain = { id: "sntc_claude_2", name: "Claude Code" }
  const cursor = { id: "sntc_cursor", name: "Cursor" }
  await connect("ada", claude, { lastUsedAt: new Date(now - 2 * DAY) })
  await connect("ada", claudeAgain, { lastUsedAt: new Date(now - 60_000) })
  await connect("ada", cursor)
  // Another account's agent and an expired grant stay out.
  await connect("bob", { id: "sntc_bob", name: "Codex" })
  await connect(
    "ada",
    { id: "sntc_old", name: "Old agent" },
    {
      lastUsedAt: new Date(now),
      refreshExpiresAt: new Date(now - DAY),
    },
  )

  const agents = await listConnectedAgents("ada")
  expect(agents.map(({ name, client }) => ({ name, client }))).toEqual([
    { name: "Cursor", client: "cursor" },
    { name: "Claude Code", client: "claude_code" },
  ])
  expect(agents[0]?.lastActiveAt).toBeNull()
  expect(agents[1]?.lastActiveAt).toBe(now - 60_000)
})

testDb("the polling action only answers for the signed-in account", async () => {
  await connect("ada", { id: "sntc_claude", name: "Claude Code" })
  expect((await getConnectedAgents()).map((agent) => agent.name)).toEqual(["Claude Code"])
  signInAs("bob")
  expect(await getConnectedAgents()).toEqual([])
  signInAs(null)
  expect(await getConnectedAgents()).toEqual([])
})

testDb("counts agent requests per day and per agent over the last two weeks", async () => {
  const now = new Date("2026-11-04T12:00:00Z")
  const today = Math.floor(now.getTime() / DAY)
  await connect("ada", { id: "sntc_claude", name: "Claude Code" })
  await connect("ada", { id: "sntc_cursor", name: "Cursor" })
  await connect("bob", { id: "sntc_bob", name: "Codex" })
  await getDb()
    .insert(apiToken)
    .values({ ownerId: "ada", name: "CLI", prefix: "snpt_cli", hash: "cli", scopes: ["read"] })
  const tokens = await getDb()
    .select({ id: apiToken.id, name: apiToken.name, owner: apiToken.ownerId })
    .from(apiToken)
  const id = (name: string) => tokens.find((token) => token.name === name)?.id ?? ""
  const usage = (owner: string, name: string, day: number, requests: number) =>
    getDb()
      .insert(apiTokenUsageDay)
      .values({ ownerId: owner, tokenId: id(name), day, requests })
  await usage("ada", "Claude Code", today, 30)
  await usage("ada", "Claude Code", today - 3, 5)
  await usage("ada", "Cursor", today, 7)
  // Outside the window, a personal token and another account's agent stay out.
  await usage("ada", "Claude Code", today - AGENT_ACTIVITY_DAYS, 100)
  await usage("ada", "CLI", today, 50)
  await usage("bob", "Codex", today, 9)

  const activity = await agentActivity("ada", now)
  expect(activity.days).toHaveLength(AGENT_ACTIVITY_DAYS)
  expect(activity.days.at(-1)).toEqual({ day: today, requests: 37 })
  expect(activity.days.at(-4)).toEqual({ day: today - 3, requests: 5 })
  expect(activity.days.reduce((sum, day) => sum + day.requests, 0)).toBe(42)
  expect(activity.agents).toEqual([
    { name: "Claude Code", client: "claude_code", requests: 35 },
    { name: "Cursor", client: "cursor", requests: 7 },
  ])
  expect((await agentActivity("ada", new Date(now.getTime() + 30 * DAY))).agents).toEqual([])
})
