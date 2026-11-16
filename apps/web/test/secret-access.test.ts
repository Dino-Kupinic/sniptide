import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { envAudit, envGroup, user } from "@workspace/db/schema"
import { asc, eq, sql } from "drizzle-orm"
import { DELETE as deleteEnv, GET as getEnv, PUT as putEnv } from "@/app/api/v1/env/[group]/route"
import { POST as manage } from "@/app/secrets/manage/route"
import { createToken } from "@/lib/api/tokens"
import { getDb } from "@/lib/db"
import { listAudit } from "@/lib/env/audit"
import { MAX_MEMBERS, secretSaveSchema, secretShareSchema } from "@/lib/env/inputs"
import {
  createSecretShare,
  grantAccess,
  listSecrets,
  removeSecret,
  revealSecret,
  revealSharedSecret,
  revokeAccess,
  revokeSecretShare,
  saveSecret,
  secretDetail,
} from "@/lib/env/web-store"
import { hasDatabase, resetDatabase, seedUser, signInAs } from "./harness"

process.env.ENV_SECRETS_KEY = "fake-wrk113-encryption-key-for-tests-only"
const describeDb = hasDatabase ? describe : describe.skip
const marker = "fake-wrk113-secret-value"
const password = "fake-share-password-113"

const input = (fields: Record<string, unknown> = {}) =>
  secretSaveSchema.parse({ slug: "billing-api", entries: [], ...fields })
async function create() {
  const result = await saveSecret(
    "ada",
    null,
    input({
      project: "Billing",
      environment: "prod",
      entries: [{ name: "API_KEY", value: marker }],
    }),
  )
  if (result.status !== "ok") throw new Error("Fixture failed.")
  return result.id
}
async function trail() {
  const rows = await getDb()
    .select()
    .from(envAudit)
    .orderBy(asc(envAudit.createdAt), asc(envAudit.id))
  return rows.map((row) => ({
    action: row.action,
    via: row.via,
    actor: row.actor,
    detail: row.detail,
  }))
}
function call(command: unknown) {
  return manage(
    new Request("http://localhost:3000/secrets/manage", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify(command),
    }),
  )
}
function api(group: string, token: string, init: RequestInit = {}) {
  return [
    new Request(`http://localhost:3000/api/v1/env/${group}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    }),
    { params: Promise.resolve({ group }) },
  ] as const
}

describeDb("secret group access", () => {
  beforeEach(async () => {
    await resetDatabase()
    for (const id of ["ada", "bob", "cy"]) await seedUser(id)
  })
  afterAll(resetDatabase)

  test("read access lists the group and reveals values, and changes nothing", async () => {
    const id = await create()
    expect(await grantAccess("ada", id, "bob", "read")).toEqual({ status: "ok" })
    expect(await listSecrets("bob")).toMatchObject([
      { id, slug: "billing-api", role: "read", owner: "ada@example.com", count: 1 },
    ])
    const detail = await secretDetail("bob", id)
    expect(detail).toMatchObject({ role: "read", entries: [{ name: "API_KEY" }] })
    expect(detail?.members).toEqual([])
    expect(detail?.shares).toEqual([])
    expect(await revealSecret("bob", id, "API_KEY")).toBe(marker)
    expect(
      await saveSecret(
        "bob",
        id,
        input({ revision: 1, entries: [{ name: "NEW", value: "x", replace: true }] }),
      ),
    ).toEqual({ status: "forbidden" })
    expect(await removeSecret("bob", id)).toBe(false)
    expect(
      await createSecretShare("bob", id, secretShareSchema.parse({ password, hours: 1 })),
    ).toBeNull()
    expect(await grantAccess("bob", id, "cy", "read")).toEqual({ status: "missing" })
    expect(await revokeAccess("bob", id, "ada")).toBe(false)
    expect(await secretDetail("cy", id)).toBeNull()
    expect(await revealSecret("cy", id, "API_KEY")).toBeNull()
  })

  test("write access edits variables and leaves settings, links, access and deletion to the owner", async () => {
    const id = await create()
    await grantAccess("ada", id, "bob", "write")
    expect(
      await saveSecret(
        "bob",
        id,
        input({ revision: 1, entries: [{ name: "NEW", value: "fake-new", replace: true }] }),
      ),
    ).toEqual({ status: "ok", id })
    expect(await revealSecret("ada", id, "NEW")).toBe("fake-new")
    expect(await saveSecret("bob", id, input({ revision: 2, project: "Renamed" }))).toEqual({
      status: "forbidden",
    })
    expect(await saveSecret("bob", id, input({ revision: 2, environment: "dev" }))).toEqual({
      status: "forbidden",
    })
    expect((await secretDetail("ada", id))?.project).toBe("Billing")
    expect(await removeSecret("bob", id)).toBe(false)
    expect(
      await createSecretShare("bob", id, secretShareSchema.parse({ password, hours: 1 })),
    ).toBeNull()
    expect(await grantAccess("bob", id, "cy", "write")).toEqual({ status: "missing" })
  })

  test("the owner changes and revokes access, and a member can leave", async () => {
    const id = await create()
    await grantAccess("ada", id, "bob", "read")
    await grantAccess("ada", id, "cy", "write")
    expect((await secretDetail("ada", id))?.members).toMatchObject([
      { id: "bob", role: "read" },
      { id: "cy", role: "write" },
    ])
    await grantAccess("ada", id, "bob", "write")
    expect((await secretDetail("bob", id))?.role).toBe("write")
    expect(await revokeAccess("ada", id, "bob")).toBe(true)
    expect(await secretDetail("bob", id)).toBeNull()
    expect(await revealSecret("bob", id, "API_KEY")).toBeNull()
    expect(await listSecrets("bob")).toEqual([])
    expect(await revokeAccess("cy", id, "cy")).toBe(true)
    expect(await secretDetail("cy", id)).toBeNull()
    expect(await grantAccess("ada", id, "ada", "read")).toEqual({ status: "missing" })
    expect(await grantAccess("ada", id, "nobody", "read")).toEqual({ status: "missing" })
  })

  test("a group is shared with a bounded number of accounts", async () => {
    const id = await create()
    await getDb()
      .insert(user)
      .values(
        Array.from({ length: MAX_MEMBERS }, (_, index) => ({
          id: `member-${index}`,
          name: `member-${index}`,
          email: `member-${index}@example.com`,
        })),
      )
    for (let index = 0; index < MAX_MEMBERS; index++)
      expect((await grantAccess("ada", id, `member-${index}`, "read")).status).toBe("ok")
    expect(await grantAccess("ada", id, "bob", "read")).toEqual({ status: "limit" })
    expect(await grantAccess("ada", id, "member-0", "write")).toEqual({ status: "ok" })
  })

  test("the manage route grants and removes access for the signed-in account", async () => {
    const id = await create()
    signInAs("bob")
    expect((await call({ operation: "grant", id, userId: "cy", role: "read" })).status).toBe(400)
    signInAs("ada")
    expect((await call({ operation: "grant", id, userId: "bob", role: "admin" })).status).toBe(400)
    expect((await call({ operation: "grant", id, userId: "bob", role: "read" })).status).toBe(200)
    signInAs("bob")
    expect((await call({ operation: "reveal", id, name: "API_KEY" })).status).toBe(200)
    const refused = await call({
      operation: "save",
      id,
      input: { slug: "billing-api", revision: 1, entries: [{ name: "X", value: "y" }] },
    })
    expect(refused.status).toBe(403)
    expect(await (await call({ operation: "delete", id })).json()).toEqual({ ok: false })
    signInAs("ada")
    expect(await (await call({ operation: "remove_access", id, userId: "bob" })).json()).toEqual({
      ok: true,
    })
    signInAs("bob")
    expect((await call({ operation: "reveal", id, name: "API_KEY" })).status).toBe(404)
    signInAs(null)
  })
})

describeDb("secret audit log", () => {
  beforeEach(async () => {
    await resetDatabase()
    for (const id of ["ada", "bob"]) await seedUser(id)
  })
  afterAll(resetDatabase)

  test("records every reveal, edit, link and access change with who did it", async () => {
    const id = await create()
    await grantAccess("ada", id, "bob", "write")
    await grantAccess("ada", id, "bob", "write")
    await revealSecret("bob", id, "API_KEY")
    await revealSecret("bob", id, "MISSING")
    await saveSecret(
      "bob",
      id,
      input({
        revision: 1,
        entries: [
          { name: "API_KEY", value: marker, replace: true },
          { name: "ADDED", value: "fake-added", replace: true },
        ],
      }),
    )
    await saveSecret("ada", id, input({ revision: 2, deleted: ["ADDED"], environment: "staging" }))
    await saveSecret("ada", id, input({ revision: 3 }))
    const token = await createSecretShare(
      "ada",
      id,
      secretShareSchema.parse({ password, hours: 1 }),
    )
    if (!token) throw new Error("Fixture failed.")
    await revealSharedSecret(token, "wrong-password", "reader")
    await revealSharedSecret(token, password, "reader")
    const [share] = (await secretDetail("ada", id))?.shares ?? []
    await revokeSecretShare("ada", id, share?.id ?? "")
    await revokeSecretShare("ada", id, share?.id ?? "")
    await revokeAccess("bob", id, "bob")
    await grantAccess("ada", id, "bob", "read")
    await revokeAccess("ada", id, "bob")
    await removeSecret("ada", id)

    const ada = "ada@example.com"
    const bob = "bob@example.com"
    expect(await trail()).toEqual([
      { action: "create", via: "web", actor: ada, detail: { variables: ["API_KEY"] } },
      {
        action: "grant",
        via: "web",
        actor: ada,
        detail: { person: bob, personId: "bob", role: "write" },
      },
      { action: "reveal", via: "web", actor: bob, detail: { variables: ["API_KEY"] } },
      { action: "edit", via: "web", actor: bob, detail: { variables: ["ADDED"] } },
      { action: "edit", via: "web", actor: ada, detail: { variables: ["ADDED"], settings: true } },
      { action: "link_create", via: "web", actor: ada, detail: {} },
      { action: "read", via: "link", actor: null, detail: {} },
      { action: "link_revoke", via: "web", actor: ada, detail: {} },
      { action: "leave", via: "web", actor: bob, detail: {} },
      {
        action: "grant",
        via: "web",
        actor: ada,
        detail: { person: bob, personId: "bob", role: "read" },
      },
      { action: "revoke", via: "web", actor: ada, detail: { person: bob, personId: "bob" } },
      { action: "delete", via: "web", actor: ada, detail: {} },
    ])
    expect(JSON.stringify(await getDb().select().from(envAudit))).not.toContain(marker)
  })

  test("records token reads and writes under the token's name", async () => {
    const created = await createToken("ada", { name: "deploy-ci", write: true, expiry: "never" })
    if (!created.ok) throw new Error("Fixture failed.")
    const put = (variables: unknown) =>
      putEnv(...api("app", created.token, { method: "PUT", body: JSON.stringify({ variables }) }))
    expect((await put([{ name: "A", value: "1" }])).status).toBe(200)
    expect((await put([{ name: "A", value: "1" }])).status).toBe(200)
    expect(
      (
        await put([
          { name: "A", value: "2" },
          { name: "B", value: "3" },
        ])
      ).status,
    ).toBe(200)
    expect((await getEnv(...api("app", created.token))).status).toBe(200)
    expect((await getEnv(...api("other", created.token))).status).toBe(404)
    expect((await deleteEnv(...api("app", created.token, { method: "DELETE" }))).status).toBe(200)
    const actor = "ada@example.com"
    expect(await trail()).toEqual([
      { action: "create", via: "token", actor, detail: { variables: ["A"], token: "deploy-ci" } },
      {
        action: "edit",
        via: "token",
        actor,
        detail: { variables: ["A", "B"], token: "deploy-ci" },
      },
      { action: "read", via: "token", actor, detail: { token: "deploy-ci" } },
      { action: "delete", via: "token", actor, detail: { token: "deploy-ci" } },
    ])
  })

  test("only the owner reads the log, which outlives the group and filters by kind", async () => {
    const id = await create()
    await grantAccess("ada", id, "bob", "read")
    await revealSecret("bob", id, "API_KEY")
    await removeSecret("ada", id)
    expect((await listAudit("bob")).entries).toEqual([])
    const all = await listAudit("ada")
    expect(all.entries.map((entry) => entry.action)).toEqual([
      "delete",
      "reveal",
      "grant",
      "create",
    ])
    expect(all.entries.every((entry) => entry.groupSlug === "billing-api")).toBe(true)
    const grant = all.entries.find((entry) => entry.action === "grant")
    expect(grant?.actor).toEqual({
      id: "ada",
      name: "ada",
      handle: "ada@example.com",
      initials: "AD",
    })
    expect(grant?.person).toMatchObject({ id: "bob", name: "bob" })
    expect((await listAudit("ada", { filter: "reads" })).entries).toHaveLength(1)
    expect((await listAudit("ada", { filter: "access", groupId: id })).entries).toHaveLength(1)
    const paged = await listAudit("ada", { limit: 3 })
    expect(paged).toMatchObject({ more: true, entries: { length: 3 } })
    expect((await listAudit("ada", { limit: 3, page: 1 })).entries).toHaveLength(1)
  })

  test("names people by their current display name, and by the recorded handle once they're gone", async () => {
    const id = await create()
    await grantAccess("ada", id, "bob", "read")
    await getDb().update(user).set({ name: "Bob Builder" }).where(eq(user.id, "bob"))
    let [grant] = (await listAudit("ada", { filter: "access" })).entries
    expect(grant?.person).toEqual({
      id: "bob",
      name: "Bob Builder",
      handle: "bob@example.com",
      initials: "BB",
    })
    await getDb().delete(user).where(eq(user.id, "bob"))
    ;[grant] = (await listAudit("ada", { filter: "access" })).entries
    expect(grant?.person).toMatchObject({ name: "bob@example.com", handle: "bob@example.com" })
  })

  test("the database refuses to change or delete an entry while its account exists", async () => {
    const id = await create()
    const run = async (query: PromiseLike<unknown>) => void (await query)
    await expect(run(getDb().update(envAudit).set({ actor: "someone else" }))).rejects.toThrow()
    await expect(run(getDb().delete(envAudit))).rejects.toThrow()
    await getDb().delete(envGroup).where(eq(envGroup.id, id))
    expect(await getDb().select().from(envAudit)).toHaveLength(1)
    await getDb().transaction(async (tx) => {
      await tx.execute(sql`select set_config('sniptide.env_audit_purge', 'on', true)`)
      await tx.delete(envAudit)
    })
    await create()
    await getDb().delete(user).where(eq(user.id, "ada"))
    expect(await getDb().select().from(envAudit)).toEqual([])
  })
})
