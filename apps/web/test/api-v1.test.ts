import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { apiToken, collection, envVariable, paste, pasteFile } from "@workspace/db/schema"
import { eq, sql } from "drizzle-orm"
import { GET as getCollectionPastes } from "@/app/api/v1/collections/[slug]/pastes/route"
import { DELETE as deleteEnv, GET as getEnv, PUT as putEnv } from "@/app/api/v1/env/[group]/route"
import { GET as listEnv } from "@/app/api/v1/env/route"
import { GET as me } from "@/app/api/v1/me/route"
import { GET as getPaste, PUT as updatePaste } from "@/app/api/v1/pastes/[id]/route"
import { POST as createPaste, GET as listPastes } from "@/app/api/v1/pastes/route"
import { createApiToken, deleteEnvGroup, revokeApiToken } from "@/lib/api/token-actions"
import { authenticate, createToken, hashToken, listTokens } from "@/lib/api/tokens"
import { getDb } from "@/lib/db"
import { telemetrySnapshot } from "@/lib/telemetry"
import { hasDatabase, resetDatabase, seedPaste, seedUser, signInAs } from "./harness"

// The token API under /api/v1 against a real Postgres: who a token reaches, what each scope
// allows, and that pastes, collections and env groups round-trip the way the CLI expects.

process.env.ENV_SECRETS_KEY = "test-env-secrets-key-that-is-long-enough"

const describeDb = hasDatabase ? describe : describe.skip
const BASE = "http://localhost:3000/api/v1"

function call(path: string, token: string | null, init: RequestInit = {}) {
  return new Request(`${BASE}/${path}`, {
    ...init,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
  })
}

const ctx = <T extends Record<string, string>>(params: T) =>
  ({ params: Promise.resolve(params) }) as never

async function body(response: Response) {
  return JSON.parse(await response.text())
}

async function tokenFor(owner: string, write = true) {
  const result = await createToken(owner, { name: "test", write, expiry: "never" })
  if (!result.ok) throw new Error(result.error)
  return result.token
}

const capture = {
  title: "Button",
  description: "Reusable button",
  tags: ["React", "component", "react"],
  collection: null,
  source: { repository: "https://github.com/example/app.git", commit: "a".repeat(40), dirty: true },
  files: [
    { name: "src/components/button.tsx", language: "tsx", content: "export const Button = 1\n" },
    {
      name: "src/hooks/use-press.ts",
      language: "ts",
      content: "export const usePress = 2\n",
      lines: { start: 3, end: 4 },
    },
  ],
}

describeDb("token API", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("ada")
    await seedUser("bob")
  })

  describe("tokens", () => {
    test("store only a hash and answer /me with the owner and scopes", async () => {
      const token = await tokenFor("ada")
      expect(token).toMatch(/^snpt_[A-Za-z0-9_-]{43}$/)
      const [row] = await getDb().select().from(apiToken)
      expect(row?.hash).toBe(hashToken(token))
      expect(JSON.stringify(row)).not.toContain(token)

      const response = await me(call("me", token))
      expect(response.status).toBe(200)
      expect(response.headers.get("cache-control")).toBe("private, no-store")
      const data = await body(response)
      expect(data.user.id).toBe("ada")
      expect(data.scopes).toEqual(["read", "write"])
      const [used] = await getDb().select().from(apiToken)
      expect(used?.lastUsedAt).toBeInstanceOf(Date)
    })

    test("updates null and stale last-used times while leaving recent times untouched", async () => {
      const token = await tokenFor("ada")
      const request = call("me", token)
      await authenticate(request)
      const [first] = await getDb().select().from(apiToken)
      expect(first?.lastUsedAt).toBeInstanceOf(Date)
      const updates = telemetrySnapshot().metrics["db:update"]?.count ?? 0
      await authenticate(request)
      expect(telemetrySnapshot().metrics["db:update"]?.count ?? 0).toBe(updates)
      const old = new Date(Date.now() - 120_000)
      await getDb()
        .update(apiToken)
        .set({ lastUsedAt: old })
        .where(eq(apiToken.hash, hashToken(token)))
      await authenticate(request)
      const [updated] = await getDb().select().from(apiToken)
      expect(updated?.lastUsedAt?.getTime()).toBeGreaterThan(old.getTime())
    })

    test("refuse missing, unknown, revoked and expired tokens", async () => {
      expect((await me(call("me", null))).status).toBe(401)
      expect((await me(call("me", "snpt_not-a-real-token-at-all"))).status).toBe(401)

      const token = await tokenFor("ada")
      const [row] = await getDb().select().from(apiToken)
      signInAs("ada")
      expect(await revokeApiToken(row?.id ?? "")).toEqual({ ok: true })
      expect((await me(call("me", token))).status).toBe(401)

      const expiring = await tokenFor("ada")
      await getDb()
        .update(apiToken)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(apiToken.hash, hashToken(expiring)))
      expect((await me(call("me", expiring))).status).toBe(401)
    })

    test("a read-only token can read but not write", async () => {
      const token = await tokenFor("ada", false)
      expect((await listPastes(call("pastes", token))).status).toBe(200)
      const created = await createPaste(
        call("pastes", token, { method: "POST", body: JSON.stringify(capture) }),
      )
      expect(created.status).toBe(403)
      expect(
        (
          await updatePaste(
            call("pastes/anything", token, { method: "PUT", body: JSON.stringify(capture) }),
            ctx({ id: "anything" }),
          )
        ).status,
      ).toBe(403)
      const pushed = await putEnv(
        call("env/app", token, { method: "PUT", body: JSON.stringify({ variables: [] }) }),
        ctx({ group: "app" }),
      )
      expect(pushed.status).toBe(403)
    })

    test("settings create, list and revoke only the viewer's tokens", async () => {
      signInAs("ada")
      const result = await createApiToken({ name: " laptop ", write: false, expiry: "30d" })
      expect(result.ok).toBe(true)
      const [token] = await listTokens("ada")
      expect(token?.name).toBe("laptop")
      expect(token?.scopes).toEqual(["read"])
      expect(token?.expiresAt).toBeGreaterThan(Date.now() + 29 * 86_400_000)
      expect(JSON.stringify(token)).not.toContain(result.ok ? result.token : "-")

      signInAs("bob")
      expect(await revokeApiToken(token?.id ?? "")).toEqual({ ok: false })
      expect(await listTokens("ada")).toHaveLength(1)

      signInAs(null)
      expect((await createApiToken({ name: "x", write: true, expiry: "never" })).ok).toBe(false)
    })
  })

  describe("pastes", () => {
    test("a capture keeps paths, order, tags, source and line ranges", async () => {
      const token = await tokenFor("ada")
      const response = await createPaste(
        call("pastes", token, { method: "POST", body: JSON.stringify(capture) }),
      )
      expect(response.status).toBe(201)
      const { paste: created } = await body(response)
      expect(created.visibility).toBe("private")
      expect(created.tags).toEqual(["react", "component"])
      expect(created.source).toEqual(capture.source)
      expect(created.url).toBe(`http://localhost:3000/${created.slug}`)
      expect(created.files).toEqual([
        {
          name: "src/components/button.tsx",
          language: "typescript",
          content: "export const Button = 1\n",
        },
        {
          name: "src/hooks/use-press.ts",
          language: "typescript",
          content: "export const usePress = 2\n",
          lines: { start: 3, end: 4 },
        },
      ])

      for (const key of [created.id, created.slug]) {
        const read = await getPaste(call(`pastes/${key}`, token), ctx({ id: key }))
        expect(read.status).toBe(200)
        expect((await body(read)).paste).toEqual(created)
      }
    })

    test("validation errors come back as 400s, and a missing collection as 404", async () => {
      const token = await tokenFor("ada")
      const post = (data: unknown) =>
        createPaste(call("pastes", token, { method: "POST", body: JSON.stringify(data) }))
      expect((await post({ ...capture, title: "" })).status).toBe(400)
      expect((await post({ ...capture, files: [] })).status).toBe(400)
      expect((await post({ ...capture, tags: ["has space"] })).status).toBe(400)
      expect(
        (
          await post({
            ...capture,
            source: { ...capture.source, repository: "https://u:p@x.io/r" },
          })
        ).status,
      ).toBe(400)
      expect(
        (await post({ ...capture, files: [{ ...capture.files[1], lines: { start: 5, end: 2 } }] }))
          .status,
      ).toBe(400)
      const bad = await createPaste(call("pastes", token, { method: "POST", body: "{" }))
      expect(bad.status).toBe(400)
      expect((await post({ ...capture, collection: "nope" })).status).toBe(404)
      expect(await getDb().select().from(paste)).toHaveLength(0)
    })

    test("tokens only reach their own live pastes", async () => {
      const ada = await tokenFor("ada")
      const bob = await tokenFor("bob")
      await seedPaste({ slug: "adas", owner: "ada", visibility: "public" })
      await seedPaste({ slug: "trashed", owner: "ada", deletedAt: new Date() })
      await seedPaste({ slug: "expired", owner: "ada", expiresAt: new Date(Date.now() - 1000) })

      expect((await getPaste(call("pastes/adas", bob), ctx({ id: "adas" }))).status).toBe(404)
      expect((await getPaste(call("pastes/trashed", ada), ctx({ id: "trashed" }))).status).toBe(404)
      expect((await getPaste(call("pastes/expired", ada), ctx({ id: "expired" }))).status).toBe(404)
      const listed = await body(await listPastes(call("pastes", ada)))
      expect(listed.pastes.map((item: { slug: string }) => item.slug)).toEqual(["adas"])
      expect((await body(await listPastes(call("pastes", bob)))).pastes).toEqual([])
    })

    test("list filters by text, tags, language and collection and pages with a cursor", async () => {
      const token = await tokenFor("ada")
      await getDb().insert(collection).values({ ownerId: "ada", slug: "ui", name: "UI" })
      const post = (data: object) =>
        createPaste(
          call("pastes", token, { method: "POST", body: JSON.stringify({ ...capture, ...data }) }),
        )
      await post({ title: "Alpha button", tags: ["react"], collection: "ui" })
      await post({ title: "Beta query", tags: ["sql"], files: [{ name: "q.sql", content: "1" }] })
      await post({ title: "Gamma", tags: ["react", "hooks"] })

      const titles = async (query: string) =>
        (await body(await listPastes(call(`pastes?${query}`, token)))).pastes.map(
          (item: { title: string }) => item.title,
        )
      expect(await titles("q=alpha")).toEqual(["Alpha button"])
      expect(await titles("q=nothing-matches")).toEqual([])
      expect((await titles("tag=react")).sort()).toEqual(["Alpha button", "Gamma"])
      expect(await titles("tag=react&tag=hooks")).toEqual(["Gamma"])
      expect(await titles("language=sql")).toEqual(["Beta query"])
      expect(await titles("collection=ui")).toEqual(["Alpha button"])

      const seen: string[] = []
      let cursor: string | null = null
      do {
        const query: string = `limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`
        const page = await body(await listPastes(call(`pastes?${query}`, token)))
        expect(page.pastes).toHaveLength(1)
        expect(page.pastes[0].files).toBeUndefined()
        seen.push(page.pastes[0].title)
        cursor = page.nextCursor
      } while (cursor)
      expect(seen.sort()).toEqual(["Alpha button", "Beta query", "Gamma"])
      expect((await listPastes(call("pastes?cursor=garbage", token))).status).toBe(400)
      expect((await listPastes(call("pastes?limit=500", token))).status).toBe(400)
    })

    test("new cursors preserve microsecond order and cover every paste exactly once", async () => {
      const token = await tokenFor("ada")
      const ids: string[] = []
      for (let index = 0; index < 4; index++) {
        const { id } = await seedPaste({ slug: `precise-${index}`, owner: "ada" })
        ids.push(id)
      }
      ids.sort()
      for (const [index, id] of ids.entries()) {
        const timestamp = `2026-10-01T12:00:00.123${String(index).padStart(3, "0")}Z`
        await getDb().execute(
          sql`UPDATE paste SET updated_at = ${timestamp}::timestamptz WHERE id = ${id}`,
        )
      }
      let cursor: string | null = null
      const seen: string[] = []
      do {
        const page = await body(
          await listPastes(call(`pastes?limit=1${cursor ? `&cursor=${cursor}` : ""}`, token)),
        )
        seen.push(...page.pastes.map((item: { id: string }) => item.id))
        cursor = page.nextCursor
        if (cursor) {
          const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString())
          expect(decoded.v).toBe(2)
          expect(decoded.at).toMatch(/\.\d{6}Z$/)
        }
      } while (cursor && seen.length < 10)
      expect(cursor).toBeNull()
      expect(seen).toEqual(ids.reverse())
    })

    test("legacy cursors retain their millisecond ordering across microsecond ties", async () => {
      const token = await tokenFor("ada")
      const ids: string[] = []
      for (let index = 0; index < 4; index++) {
        const { id } = await seedPaste({ slug: `legacy-${index}`, owner: "ada" })
        ids.push(id)
      }
      ids.sort()
      for (const [index, id] of ids.entries()) {
        await getDb().execute(
          sql`UPDATE paste SET updated_at = ${`2026-10-01T12:00:00.123${String(index).padStart(3, "0")}Z`}::timestamptz WHERE id = ${id}`,
        )
      }
      let cursor: string | null = Buffer.from(
        JSON.stringify({ at: "2026-10-01T12:00:00.123Z", id: ids[0] }),
      ).toString("base64url")
      const seen: string[] = []
      do {
        const page = await body(await listPastes(call(`pastes?limit=1&cursor=${cursor}`, token)))
        seen.push(...page.pastes.map((item: { id: string }) => item.id))
        cursor = page.nextCursor
      } while (cursor)
      expect(seen).toEqual(ids.slice(1))
    })

    test("search matches every word across description, tags, file paths and code", async () => {
      const token = await tokenFor("ada")
      const post = (data: object) =>
        createPaste(
          call("pastes", token, { method: "POST", body: JSON.stringify({ ...capture, ...data }) }),
        )
      await post({
        title: "Fetch helper",
        description: "Retries failed requests",
        files: [{ name: "lib/http/fetch.ts", content: "export const backoff = (n) => 2 ** n" }],
      })
      await post({
        title: "Queue worker",
        tags: ["redis"],
        files: [{ name: "w.ts", content: "1" }],
      })
      await post({ title: "100% safe_name", files: [{ name: "x.ts", content: "1" }] })

      const titles = async (q: string) =>
        (await body(await listPastes(call(`pastes?q=${encodeURIComponent(q)}`, token)))).pastes.map(
          (item: { title: string }) => item.title,
        )
      expect(await titles("retries BACKOFF")).toEqual(["Fetch helper"])
      expect(await titles("lib/http")).toEqual(["Fetch helper"])
      expect(await titles("redis worker")).toEqual(["Queue worker"])
      expect(await titles("retries redis")).toEqual([])
      // LIKE wildcards in a query are literal characters.
      expect(await titles("100%")).toEqual(["100% safe_name"])
      expect(await titles("e_n")).toEqual(["100% safe_name"])
    })
    test("a collection comes back in full, oldest first, across pages", async () => {
      const token = await tokenFor("ada")
      await getDb().insert(collection).values({ ownerId: "ada", slug: "kit", name: "Kit" })
      const start = Date.now() - 1_000_000
      for (let index = 0; index < 55; index++) {
        const { id } = await seedPaste({ slug: `kit-${index}`, owner: "ada", collection: "kit" })
        // Two pastes share each timestamp, so the id has to break ties across page boundaries.
        await getDb()
          .update(paste)
          .set({ createdAt: new Date(start + Math.floor(index / 2) * 1000) })
          .where(eq(paste.id, id))
      }
      await seedPaste({
        slug: "kit-trashed",
        owner: "ada",
        collection: "kit",
        deletedAt: new Date(),
      })
      await seedPaste({ slug: "kit-bobs", owner: "bob", collection: "kit" })

      const slugs: string[] = []
      let cursor: string | null = null
      let pages = 0
      do {
        const response = await getCollectionPastes(
          call(`collections/kit/pastes${cursor ? `?cursor=${cursor}` : ""}`, token),
          ctx({ slug: "kit" }),
        )
        const page = await body(response)
        for (const item of page.pastes) {
          expect(item.files[0].content).toBe(`secret-body-of-${item.slug}`)
          slugs.push(item.slug)
        }
        cursor = page.nextCursor
        pages++
      } while (cursor)
      expect(pages).toBe(2)
      expect(slugs).toHaveLength(55)
      expect(new Set(slugs).size).toBe(55)
      const created = await getDb().select().from(paste)
      const order = new Map(created.map((row) => [row.slug, row.createdAt.getTime()]))
      for (let index = 1; index < slugs.length; index++)
        expect(order.get(slugs[index] ?? "")).toBeGreaterThanOrEqual(
          order.get(slugs[index - 1] ?? "") ?? 0,
        )

      const missing = await getCollectionPastes(
        call("collections/none/pastes", token),
        ctx({ slug: "none" }),
      )
      expect(missing.status).toBe(404)
      const bob = await tokenFor("bob")
      expect(
        (await getCollectionPastes(call("collections/kit/pastes", bob), ctx({ slug: "kit" })))
          .status,
      ).toBe(404)
    })

    test("collection cursors preserve microseconds across the fifty-item boundary", async () => {
      const token = await tokenFor("ada")
      await getDb().insert(collection).values({ ownerId: "ada", slug: "precise", name: "Precise" })
      const ids: string[] = []
      for (let index = 0; index < 55; index++) {
        const { id } = await seedPaste({
          slug: `collection-precise-${index}`,
          owner: "ada",
          collection: "precise",
        })
        ids.push(id)
      }
      ids.sort().reverse()
      for (const [index, id] of ids.entries()) {
        const timestamp = `2026-10-01T12:00:00.123${String(index).padStart(3, "0")}Z`
        await getDb().execute(
          sql`UPDATE paste SET created_at = ${timestamp}::timestamptz WHERE id = ${id}`,
        )
      }
      const first = await body(
        await getCollectionPastes(
          call("collections/precise/pastes", token),
          ctx({ slug: "precise" }),
        ),
      )
      const second = await body(
        await getCollectionPastes(
          call(`collections/precise/pastes?cursor=${first.nextCursor}`, token),
          ctx({ slug: "precise" }),
        ),
      )
      expect([...first.pastes, ...second.pastes].map((item: { id: string }) => item.id)).toEqual(
        ids,
      )
      expect(second.nextCursor).toBeNull()

      const legacyOrder = [...ids].sort()
      let legacyCursor: string | null = Buffer.from(
        JSON.stringify({ at: "2026-10-01T12:00:00.123Z", id: legacyOrder[0] }),
      ).toString("base64url")
      const legacySeen: string[] = []
      do {
        const page = await body(
          await getCollectionPastes(
            call(`collections/precise/pastes?cursor=${legacyCursor}`, token),
            ctx({ slug: "precise" }),
          ),
        )
        legacySeen.push(...page.pastes.map((item: { id: string }) => item.id))
        legacyCursor = page.nextCursor
      } while (legacyCursor && legacySeen.length < 100)
      expect(legacyCursor).toBeNull()
      expect(legacySeen).toEqual(legacyOrder.slice(1))
    })
  })

  describe("env groups", () => {
    const variables = [
      { name: "DATABASE_URL", value: "postgres://app:hunter2@db/app" },
      { name: "EMPTY", value: "" },
      { name: "MULTI", value: "line one\nline two" },
    ]

    async function put(token: string, group: string, data: unknown) {
      return putEnv(
        call(`env/${group}`, token, { method: "PUT", body: JSON.stringify(data) }),
        ctx({ group }),
      )
    }

    test("round-trip in order, encrypted at rest", async () => {
      const token = await tokenFor("ada")
      const pushed = await put(token, "my-app", { variables })
      expect(pushed.status).toBe(200)

      const stored = await getDb().select().from(envVariable)
      expect(stored).toHaveLength(3)
      for (const row of stored) {
        expect(row.value).toStartWith("v1:")
        expect(row.value).not.toContain("hunter2")
      }

      const read = await body(await getEnv(call("env/my-app", token), ctx({ group: "my-app" })))
      expect(read.group.slug).toBe("my-app")
      expect(read.group.variables).toEqual(variables)

      const list = await body(await listEnv(call("env", token)))
      expect(list.groups).toEqual([expect.objectContaining({ slug: "my-app", variables: 3 })])
      expect(JSON.stringify(list)).not.toContain("hunter2")
    })

    test("a push replaces the whole group", async () => {
      const token = await tokenFor("ada")
      await put(token, "app", { variables })
      await put(token, "app", { variables: [{ name: "ONLY", value: "1" }] })
      const read = await body(await getEnv(call("env/app", token), ctx({ group: "app" })))
      expect(read.group.variables).toEqual([{ name: "ONLY", value: "1" }])
    })

    test("a value moved to another row doesn't decrypt", async () => {
      const token = await tokenFor("ada")
      await put(token, "app", { variables })
      const [first] = await getDb()
        .select()
        .from(envVariable)
        .where(eq(envVariable.name, "DATABASE_URL"))
      await getDb()
        .update(envVariable)
        .set({ value: first?.value ?? "" })
        .where(eq(envVariable.name, "EMPTY"))
      await expect(getEnv(call("env/app", token), ctx({ group: "app" }))).rejects.toThrow()
    })

    test("bad names, duplicates and bad group names are refused", async () => {
      const token = await tokenFor("ada")
      expect((await put(token, "app", { variables: [{ name: "1BAD", value: "" }] })).status).toBe(
        400,
      )
      expect(
        (
          await put(token, "app", {
            variables: [
              { name: "A", value: "1" },
              { name: "A", value: "2" },
            ],
          })
        ).status,
      ).toBe(400)
      expect((await put(token, "Bad Name", { variables: [] })).status).toBe(400)
      expect((await put(token, "app", {})).status).toBe(400)
      expect(
        (await put(token, "app", { variables: [{ name: "BIG", value: "x".repeat(33 * 1024) }] }))
          .status,
      ).toBe(400)
    })

    test("groups are per account, and delete removes them", async () => {
      const ada = await tokenFor("ada")
      const bob = await tokenFor("bob")
      await put(ada, "app", { variables })
      expect((await getEnv(call("env/app", bob), ctx({ group: "app" }))).status).toBe(404)
      expect(
        (await deleteEnv(call("env/app", bob, { method: "DELETE" }), ctx({ group: "app" }))).status,
      ).toBe(404)
      expect(
        (await deleteEnv(call("env/app", ada, { method: "DELETE" }), ctx({ group: "app" }))).status,
      ).toBe(200)
      expect((await getEnv(call("env/app", ada), ctx({ group: "app" }))).status).toBe(404)

      await put(ada, "other", { variables })
      signInAs("bob")
      expect(await deleteEnvGroup("other")).toEqual({ ok: false })
      signInAs("ada")
      expect(await deleteEnvGroup("other")).toEqual({ ok: true })
      expect(await getDb().select().from(envVariable)).toHaveLength(0)
    })
  })

  test("deleting an account removes its tokens, pastes and env groups", async () => {
    const token = await tokenFor("ada")
    await createPaste(call("pastes", token, { method: "POST", body: JSON.stringify(capture) }))
    await putEnv(
      call("env/app", token, { method: "PUT", body: JSON.stringify({ variables: [] }) }),
      ctx({ group: "app" }),
    )
    await resetDatabase()
    expect(await getDb().select().from(apiToken)).toHaveLength(0)
    expect(await getDb().select().from(pasteFile)).toHaveLength(0)
  })
})
