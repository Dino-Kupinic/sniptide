import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { envGroup, envShare, envVariable } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { POST as sharedReveal } from "@/app/secret-share/[token]/reveal/route"
import { POST as manage } from "@/app/secrets/manage/route"
import { getDb } from "@/lib/db"
import { secretSaveSchema, secretShareSchema } from "@/lib/env/inputs"
import { readGroup, writeGroup } from "@/lib/env/store"
import {
  createSecretShare,
  listSecrets,
  removeSecret,
  revealSecret,
  revealSharedSecret,
  revokeSecretShare,
  saveSecret,
  secretDetail,
} from "@/lib/env/web-store"
import { hasDatabase, resetDatabase, seedUser, signInAs } from "./harness"

process.env.ENV_SECRETS_KEY = "fake-wrk110-encryption-key-for-tests-only"
const describeDb = hasDatabase ? describe : describe.skip
const marker = "fake-wrk110-secret-value"
const password = "fake-share-password-110"
const input = (entries = [{ name: "API_KEY", value: marker }], revision?: number) =>
  secretSaveSchema.parse({
    slug: "project-dev",
    project: "Example",
    environment: "dev",
    entries,
    revision,
  })
async function create() {
  const result = await saveSecret("ada", null, input())
  if (result.status !== "ok") throw new Error("Fixture failed.")
  return result.id
}
async function share(id: string) {
  const token = await createSecretShare("ada", id, secretShareSchema.parse({ password, hours: 1 }))
  if (!token) throw new Error("Fixture failed.")
  return token
}
function call(command: unknown, origin = "http://localhost:3000") {
  return manage(
    new Request("http://localhost:3000/secrets/manage", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(command),
    }),
  )
}
async function revealLink(token: string, value = password) {
  return sharedReveal(
    new Request(`https://shares.example/secret-share/${token}/reveal`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: value }),
    }),
    { params: Promise.resolve({ token }) },
  )
}

describeDb("encrypted web secrets", () => {
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("ada")
    await seedUser("bob")
  })
  afterAll(resetDatabase)
  test("creates ciphertext only and lists metadata without any values", async () => {
    const id = await create()
    const [stored] = await getDb().select().from(envVariable).where(eq(envVariable.groupId, id))
    expect(stored?.value).toMatch(/^v1:/)
    expect(stored?.value).not.toContain(marker)
    expect(JSON.stringify(await listSecrets("ada"))).not.toContain(marker)
    const detail = await secretDetail("ada", id)
    expect(detail?.entries).toEqual([{ name: "API_KEY" }])
    expect(JSON.stringify(detail)).not.toContain("ciphertext")
    expect(JSON.stringify(detail)).not.toContain(marker)
    expect(await revealSecret("ada", id, "API_KEY")).toBe(marker)
    expect(await listSecrets("bob")).toEqual([])
    expect(await secretDetail("bob", id)).toBeNull()
    expect(await revealSecret("bob", id, "API_KEY")).toBeNull()
    expect(await saveSecret("bob", id, input([], 1))).toEqual({ status: "missing" })
    expect(await removeSecret("bob", id)).toBe(false)
    expect(
      await createSecretShare("bob", id, secretShareSchema.parse({ password, hours: 1 })),
    ).toBeNull()
  })
  test("an update without project or environment keeps them, and a new group needs both", async () => {
    const id = await create()
    const update = secretSaveSchema.parse({
      slug: "project-dev",
      revision: 1,
      entries: [{ name: "SECOND", value: "fake-second", replace: true }],
    })
    expect(await saveSecret("ada", id, update)).toEqual({ status: "ok", id })
    const detail = await secretDetail("ada", id)
    expect(detail?.project).toBe("Example")
    expect(detail?.environment).toBe("dev")
    expect(detail?.entries).toEqual([{ name: "API_KEY" }, { name: "SECOND" }])
    expect(await revealSecret("ada", id, "API_KEY")).toBe(marker)
    expect(
      await saveSecret("ada", null, secretSaveSchema.parse({ slug: "bare", entries: [] })),
    ).toEqual({ status: "invalid" })
  })
  test("preserves blank existing ciphertext, supports explicit empty values and deletion", async () => {
    const id = await create()
    const [before] = await getDb().select().from(envVariable).where(eq(envVariable.groupId, id))
    expect(
      await saveSecret(
        "ada",
        id,
        input(
          [
            { name: "API_KEY", value: "" },
            { name: "SECOND", value: "second" },
          ],
          1,
        ),
      ),
    ).toEqual({ status: "ok", id })
    const after = await getDb().select().from(envVariable).where(eq(envVariable.groupId, id))
    expect(after.find((row) => row.name === "API_KEY")?.value).toBe(before?.value)
    expect(
      await saveSecret(
        "ada",
        id,
        secretSaveSchema.parse({
          ...input([], 2),
          entries: [{ name: "API_KEY", value: "", replace: true }],
          deleted: ["SECOND"],
        }),
      ),
    ).toEqual({ status: "ok", id })
    expect(await revealSecret("ada", id, "API_KEY")).toBe("")
    expect(await revealSecret("ada", id, "SECOND")).toBeNull()
  })
  test("saves a variable removed and re-added in the same edit", async () => {
    const id = await create()
    const result = await saveSecret(
      "ada",
      id,
      secretSaveSchema.parse({
        ...input([{ name: "API_KEY", value: "fake-readded-value" }], 1),
        deleted: ["API_KEY"],
      }),
    )
    expect(result).toEqual({ status: "ok", id })
    expect(await revealSecret("ada", id, "API_KEY")).toBe("fake-readded-value")
  })
  test("keeps CLI slugs and metadata while stale web writes conflict", async () => {
    const id = await create()
    await writeGroup("ada", "project-dev", [{ name: "CLI", value: "fake-cli-value" }])
    const detail = await secretDetail("ada", id)
    expect(detail?.project).toBe("Example")
    expect(detail?.environment).toBe("dev")
    expect(detail?.revision).toBe(2)
    expect(await saveSecret("ada", id, input([], 1))).toEqual({ status: "conflict" })
    expect((await readGroup("ada", "project-dev"))?.variables).toEqual([
      { name: "CLI", value: "fake-cli-value" },
    ])
    const results = await Promise.all([
      saveSecret("ada", id, input([], 2)),
      saveSecret("ada", id, input([], 2)),
    ])
    expect(results.map((result) => result.status).sort()).toEqual(["conflict", "ok"])
  })
  test("supports assigning project and environment to an existing CLI group", async () => {
    await writeGroup("ada", "project-dev", [{ name: "CLI", value: marker }])
    const [group] = await getDb().select().from(envGroup)
    if (!group) throw new Error("Fixture failed.")
    expect(await saveSecret("ada", group.id, input([], 0))).toEqual({ status: "ok", id: group.id })
    expect(await revealSecret("ada", group.id, "CLI")).toBe(marker)
  })
  test("hashes link tokens and passwords and shares live values", async () => {
    const id = await create()
    const token = await share(id)
    const [stored] = await getDb().select().from(envShare)
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(JSON.stringify(stored)).not.toContain(token)
    expect(JSON.stringify(stored)).not.toContain(password)
    expect(await revealSharedSecret(token, "wrong-password", "reader")).toEqual({
      status: "locked",
    })
    expect(await revealSharedSecret(token, password, "reader")).toEqual({
      status: "ok",
      entries: [{ name: "API_KEY", value: marker }],
    })
    await writeGroup("ada", "project-dev", [{ name: "NEW", value: "fake-updated-value" }])
    expect(await revealSharedSecret(token, password, "reader")).toEqual({
      status: "ok",
      entries: [{ name: "NEW", value: "fake-updated-value" }],
    })
    expect(await revokeSecretShare("bob", id, stored?.id ?? "")).toBe(false)
    expect(await revokeSecretShare("ada", id, stored?.id ?? "")).toBe(true)
    expect(await revealSharedSecret(token, password, "reader")).toEqual({ status: "locked" })
  })
  test("checks expiry on every read and deletion invalidates links", async () => {
    const id = await create()
    const token = await share(id)
    await getDb()
      .update(envShare)
      .set({ expiresAt: new Date(Date.now() - 1) })
    expect(await revealSharedSecret(token, password, "reader")).toEqual({ status: "locked" })
    const second = await share(id)
    expect(await removeSecret("ada", id)).toBe(true)
    expect(await revealSharedSecret(second, password, "reader")).toEqual({ status: "locked" })
    expect(await getDb().select().from(envShare)).toEqual([])
  })
  test("rate limits successful reads and password attempts per share", async () => {
    const id = await create()
    const token = await share(id)
    for (let attempt = 0; attempt < 30; attempt++)
      await revealSharedSecret(
        token,
        attempt % 2 ? password : "wrong-password",
        `reader-${attempt}`,
      )
    expect((await revealSharedSecret(token, password, "new-reader")).status).toBe("limited")
  })
  test("rate limits client addresses across links", async () => {
    for (let attempt = 0; attempt < 60; attempt++)
      await revealSharedSecret(`unknown-${attempt}`, password, "same-reader")
    const id = await create()
    const token = await share(id)
    expect((await revealSharedSecret(token, password, "same-reader")).status).toBe("limited")
  })
  test("serializes revocation and reveal without deadlock", async () => {
    const id = await create()
    const token = await share(id)
    const [row] = await getDb().select().from(envShare)
    if (!row) throw new Error("Fixture failed.")
    await Promise.all([
      revealSharedSecret(token, password, "reader"),
      revokeSecretShare("ada", id, row.id),
    ])
    expect(await revealSharedSecret(token, password, "reader")).toEqual({ status: "locked" })
  })
  test("owner endpoint authenticates, checks origin and returns no-store only on explicit reveal", async () => {
    const id = await create()
    const command = { operation: "reveal", id, name: "API_KEY" }
    expect((await call(command)).status).toBe(401)
    signInAs("bob")
    expect((await call(command)).status).toBe(404)
    signInAs("ada")
    expect((await call(command, "https://attacker.example")).status).toBe(403)
    const response = await call(command)
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toContain("no-store")
    expect(response.headers.get("referrer-policy")).toBe("no-referrer")
    expect(await response.json()).toEqual({ value: marker })
    const invalid = await call({ operation: "save", id, input: { project: marker } })
    expect(invalid.status).toBe(400)
    expect(await invalid.text()).not.toContain(marker)
  })
  test("public reveals use current passwords, safe errors and private no-store responses", async () => {
    const token = await share(await create())
    const response = await revealLink(token)
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toContain("no-store")
    expect(response.headers.get("x-robots-tag")).toContain("noindex")
    expect(await response.json()).toEqual({ entries: [{ name: "API_KEY", value: marker }] })
    const locked = await revealLink(token, "wrong-password")
    expect(locked.status).toBe(403)
    expect(locked.headers.get("cache-control")).toContain("no-store")
    expect(await locked.text()).not.toContain(token)
    const oversized = await sharedReveal(
      new Request(`https://shares.example/secret-share/${token}/reveal`, {
        method: "POST",
        body: "x".repeat(1025),
      }),
      { params: Promise.resolve({ token }) },
    )
    expect(oversized.status).toBe(403)
  })
})
