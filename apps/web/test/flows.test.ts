import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { collection, paste } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { GET as getCollectionPastes } from "@/app/api/v1/collections/[slug]/pastes/route"
import { PUT as putSteps } from "@/app/api/v1/collections/[slug]/steps/route"
import { mcpBackend } from "@/lib/api/mcp"
import { listCollectionSteps } from "@/lib/api/pastes"
import { createToken } from "@/lib/api/tokens"
import { deleteCollection, restoreCollection, saveCollectionSteps } from "@/lib/collections/actions"
import { getDb } from "@/lib/db"
import { setPasteCollection } from "@/lib/pastes/actions"
import { hasDatabase, resetDatabase, seedPaste, seedUser, signInAs } from "./harness"

// Flows: a collection's pastes in an order the owner sets, each with an instruction, returned the
// same way to the REST API, MCP and the CLI.

const describeDb = hasDatabase ? describe : describe.skip
const BASE = "http://localhost:3000/api/v1"

function call(path: string, token: string, init: RequestInit = {}) {
  return new Request(`${BASE}/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
  })
}

const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) }) as never

async function tokenFor(owner: string, write = true) {
  const result = await createToken(owner, { name: "test", write, expiry: "never" })
  if (!result.ok) throw new Error(result.error)
  return result.token
}

function setSteps(token: string, slug: string, steps: unknown) {
  return putSteps(
    call(`collections/${slug}/steps`, token, {
      method: "PUT",
      body: JSON.stringify({ steps }),
    }),
    ctx({ slug }),
  )
}

async function readCollection(token: string, slug: string) {
  const response = await getCollectionPastes(
    call(`collections/${slug}/pastes`, token),
    ctx({ slug }),
  )
  expect(response.status).toBe(200)
  return (await response.json()) as {
    pastes: { id: string; slug: string }[]
    steps: { id: string; instruction: string }[]
  }
}

// Three pastes in "kit", captured a, b, c.
async function seedKit() {
  await getDb().insert(collection).values({ ownerId: "ada", slug: "kit", name: "Kit" })
  const start = Date.now() - 100_000
  const ids: Record<string, string> = {}
  for (const [index, name] of ["a", "b", "c"].entries()) {
    const { id } = await seedPaste({ slug: name, owner: "ada", collection: "kit" })
    await getDb()
      .update(paste)
      .set({ createdAt: new Date(start + index * 1000) })
      .where(eq(paste.id, id))
    ids[name] = id
  }
  return ids as { a: string; b: string; c: string }
}

describeDb("flows", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("ada")
    await seedUser("bob")
    signInAs("ada")
  })

  test("a collection reads in capture order until the owner orders its steps", async () => {
    const ids = await seedKit()
    const token = await tokenFor("ada")
    const before = await readCollection(token, "kit")
    expect(before.pastes.map((item) => item.slug)).toEqual(["a", "b", "c"])
    expect(before.steps).toEqual([
      { id: ids.a, instruction: "" },
      { id: ids.b, instruction: "" },
      { id: ids.c, instruction: "" },
    ])

    const response = await setSteps(token, "kit", [
      { id: ids.c, instruction: "  Add the schema.  " },
      { id: ids.a, instruction: "Wire the route." },
    ])
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      collection: "kit",
      steps: [
        { step: 1, id: ids.c, title: "title-of-c", instruction: "Add the schema." },
        { step: 2, id: ids.a, title: "title-of-a", instruction: "Wire the route." },
        { step: 3, id: ids.b, title: "title-of-b", instruction: "" },
      ],
    })
    const after = await readCollection(token, "kit")
    expect(after.pastes.map((item) => item.slug)).toEqual(["c", "a", "b"])
    expect(after.steps.map((step) => step.instruction)).toEqual([
      "Add the schema.",
      "Wire the route.",
      "",
    ])

    // An omitted instruction stays, an empty one clears, and a paste added later goes last.
    await seedPaste({ slug: "d", owner: "ada", collection: "kit" })
    await setSteps(token, "kit", [{ id: ids.a }, { id: ids.c, instruction: "" }])
    const steps = await listCollectionSteps("ada", "kit")
    expect(steps?.map((step) => [step.slug, step.instruction])).toEqual([
      ["a", "Wire the route."],
      ["c", ""],
      ["b", ""],
      ["d", ""],
    ])
  })

  test("steps page in their order across cursors", async () => {
    await getDb().insert(collection).values({ ownerId: "ada", slug: "kit", name: "Kit" })
    const ids: string[] = []
    for (let index = 0; index < 55; index++)
      ids.push((await seedPaste({ slug: `kit-${index}`, owner: "ada", collection: "kit" })).id)
    const token = await tokenFor("ada")
    // Order the last 52 in reverse; the first three stay unplaced and come last.
    const ordered = ids.slice(3).reverse()
    expect(
      (
        await setSteps(
          token,
          "kit",
          ordered.map((id) => ({ id })),
        )
      ).status,
    ).toBe(200)

    const seen: string[] = []
    let cursor: string | null = null
    do {
      const query: string = cursor ? `?cursor=${cursor}` : ""
      const response = await getCollectionPastes(
        call(`collections/kit/pastes${query}`, token),
        ctx({ slug: "kit" }),
      )
      const page = await response.json()
      seen.push(...page.pastes.map((item: { id: string }) => item.id))
      cursor = page.nextCursor
    } while (cursor)
    expect(seen.slice(0, 52)).toEqual(ordered)
    expect(new Set(seen.slice(52))).toEqual(new Set(ids.slice(0, 3)))
  })

  test("only live pastes in the collection can be steps, and only for their owner", async () => {
    const ids = await seedKit()
    const elsewhere = await seedPaste({ slug: "loose", owner: "ada" })
    const trashed = await seedPaste({
      slug: "gone",
      owner: "ada",
      collection: "kit",
      deletedAt: new Date(),
    })
    const token = await tokenFor("ada")
    for (const id of [elsewhere.id, trashed.id])
      expect((await setSteps(token, "kit", [{ id: ids.a }, { id }])).status).toBe(422)
    expect((await setSteps(token, "kit", [{ id: ids.a }, { id: ids.a }])).status).toBe(400)
    expect((await setSteps(token, "kit", [])).status).toBe(400)
    expect(
      (await setSteps(token, "kit", [{ id: ids.a, instruction: "x".repeat(501) }])).status,
    ).toBe(400)
    expect((await setSteps(token, "none", [{ id: ids.a }])).status).toBe(404)
    expect((await setSteps(await tokenFor("bob"), "kit", [{ id: ids.a }])).status).toBe(404)
    expect((await setSteps(await tokenFor("ada", false), "kit", [{ id: ids.a }])).status).toBe(403)
    // Nothing above changed the order.
    expect((await listCollectionSteps("ada", "kit"))?.map((step) => step.slug)).toEqual([
      "a",
      "b",
      "c",
    ])
  })

  test("moving a paste to another collection clears its step", async () => {
    const ids = await seedKit()
    await getDb().insert(collection).values({ ownerId: "ada", slug: "other", name: "Other" })
    const token = await tokenFor("ada")
    await setSteps(token, "kit", [
      { id: ids.c, instruction: "First." },
      { id: ids.b, instruction: "Second." },
    ])
    await setPasteCollection("c", "other")
    await setPasteCollection("c", "kit")
    const [row] = await getDb().select().from(paste).where(eq(paste.id, ids.c))
    expect(row?.collectionPosition).toBeNull()
    expect(row?.stepInstruction).toBe("")
    expect((await listCollectionSteps("ada", "kit"))?.map((step) => step.slug)).toEqual([
      "b",
      "a",
      "c",
    ])
  })

  test("undoing a collection delete brings its steps back", async () => {
    const ids = await seedKit()
    expect(
      await saveCollectionSteps("kit", [
        { id: ids.b, instruction: "Start here." },
        { id: ids.a, instruction: "" },
        { id: ids.c, instruction: "Finish." },
      ]),
    ).toEqual({ ok: true })
    const snapshot = await deleteCollection("kit")
    if (!snapshot) throw new Error("expected a snapshot")
    expect(await restoreCollection(snapshot)).toEqual({ ok: true })
    expect(
      (await listCollectionSteps("ada", "kit"))?.map((step) => [step.slug, step.instruction]),
    ).toEqual([
      ["b", "Start here."],
      ["a", ""],
      ["c", "Finish."],
    ])
  })

  test("the steps editor refuses pastes outside the collection", async () => {
    const ids = await seedKit()
    const loose = await seedPaste({ slug: "loose", owner: "ada" })
    const result = await saveCollectionSteps("kit", [
      { id: ids.a, instruction: "" },
      { id: loose.id, instruction: "" },
    ])
    expect(result.ok).toBe(false)
    signInAs("bob")
    expect((await saveCollectionSteps("kit", [{ id: ids.a, instruction: "" }])).ok).toBe(false)
  })

  test("MCP returns each step's instruction and can order the steps", async () => {
    const ids = await seedKit()
    const owner = { tokenId: "t", userId: "ada", scopes: ["read", "write"] as const }
    const backend = mcpBackend({ ...owner, scopes: [...owner.scopes] })
    const result = await backend.setSteps("kit", [
      { id: ids.b, instruction: "Do b first." },
      { id: ids.a },
    ])
    expect((result.steps as { id: string }[]).map((step) => step.id)).toEqual([ids.b, ids.a, ids.c])
    const page = await backend.collection("kit", null)
    expect(page.pastes.map((item) => item.id)).toEqual([ids.b, ids.a, ids.c])
    expect(page.instructions).toEqual(["Do b first.", "", ""])

    const reader = mcpBackend({ tokenId: "t", userId: "ada", scopes: ["read"] })
    await expect(reader.setSteps("kit", [{ id: ids.a }])).rejects.toThrow("write scope")
  })
})
