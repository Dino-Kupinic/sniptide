import { afterAll, beforeEach, expect, test } from "bun:test"
import { apiToken, oauthClient } from "@workspace/db/schema"
import { getConnectedAgents } from "@/lib/agent-actions"
import { listConnectedAgents } from "@/lib/agents"
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
