import { afterAll, beforeEach, expect, test } from "bun:test"
import { apiToken, oauthClient, paste } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { POST as createPaste } from "@/app/api/v1/pastes/route"
import { mcpBackend } from "@/lib/api/mcp"
import { authenticate, createToken, hashToken } from "@/lib/api/tokens"
import { getDb } from "@/lib/db"
import { getDashboardData } from "@/lib/pastes/dashboard"
import { createPaste as createWebPaste, getPaste } from "@/lib/pastes/store"
import { hasDatabase, resetDatabase, seedUser, signInAs } from "./harness"

// WRK-489: every paste records where it was created, and an OAuth-connected agent's pastes
// remember which agent made them.

const testDb = hasDatabase ? test : test.skip
const BASE = "http://localhost:3000/api/v1"
const capture = {
  title: "From outside",
  files: [{ name: "a.ts", language: "ts", content: "export const a = 1\n" }],
}

function post(token: string, client?: string) {
  return new Request(`${BASE}/pastes`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(client ? { "x-sniptide-client": client } : {}),
    },
    body: JSON.stringify(capture),
  })
}

async function originOf(id: string) {
  const [row] = await getDb()
    .select({ via: paste.createdVia, agent: paste.createdByAgent })
    .from(paste)
    .where(eq(paste.id, id))
  return row
}

async function personalToken() {
  const result = await createToken("ada", { name: "laptop", write: true, expiry: "never" })
  if (!result.ok) throw new Error(result.error)
  return result.token
}

// An OAuth connection is an api_token row tied to the client that registered.
async function agentToken(name: string) {
  const raw = `snpt_${crypto.randomUUID().replaceAll("-", "")}`
  await getDb()
    .insert(oauthClient)
    .values({ id: `sntc_${name}`, name, redirectUris: ["http://localhost/cb"] })
  await getDb()
    .insert(apiToken)
    .values({
      ownerId: "ada",
      name,
      prefix: raw.slice(0, 12),
      hash: hashToken(raw),
      scopes: ["read", "write"],
      clientId: `sntc_${name}`,
    })
  return raw
}

beforeEach(async () => {
  if (!hasDatabase) return
  await resetDatabase()
  await seedUser("ada")
  signInAs("ada")
})
afterAll(() => signInAs(null))

testDb("the API, the CLI and the web editor each record where a paste came from", async () => {
  const token = await personalToken()
  const api = (await (await createPaste(post(token))).json()).paste
  const cli = (await (await createPaste(post(token, "cli"))).json()).paste
  const spoofed = (await (await createPaste(post(token, "browser"))).json()).paste
  expect(await originOf(api.id)).toEqual({ via: "api", agent: null })
  expect(await originOf(cli.id)).toEqual({ via: "cli", agent: null })
  expect(await originOf(spoofed.id)).toEqual({ via: "api", agent: null })

  const { slug } = await createWebPaste({
    title: "Typed in",
    description: "",
    files: [{ name: "b.ts", language: "ts", content: "b" }],
    visibility: "unlisted",
    expiry: "never",
    slug: "",
    collection: null,
    password: null,
    burnAfterRead: false,
  })
  expect((await getPaste(slug))?.createdBy).toBeNull()
})

testDb("an OAuth agent's pastes remember the agent, over REST and MCP", async () => {
  const raw = await agentToken("Claude Code")
  const owner = await authenticate(
    new Request(BASE, { headers: { authorization: `Bearer ${raw}` } }),
  )
  expect(owner?.agent).toBe("claude_code")
  const rest = (await (await createPaste(post(raw))).json()).paste
  expect(await originOf(rest.id)).toEqual({ via: "api", agent: "claude_code" })

  if (!owner) throw new Error("The agent token didn't authenticate.")
  const { paste: viaMcp } = await mcpBackend(owner).create(capture)
  expect(await originOf((viaMcp as { id: string }).id)).toEqual({
    via: "mcp",
    agent: "claude_code",
  })

  const personal = await authenticate(
    new Request(BASE, { headers: { authorization: `Bearer ${await personalToken()}` } }),
  )
  expect(personal?.agent).toBeNull()

  const data = await getDashboardData("en", ["agent_pastes"])
  expect(data.agentPastes?.map((row) => row.createdBy)).toEqual([
    { via: "mcp", agent: "claude_code" },
    { via: "api", agent: "claude_code" },
  ])
})
