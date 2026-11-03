import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test"
import { PUT as updateCapture } from "@/app/api/v1/pastes/[id]/route"
import { POST as createCapture } from "@/app/api/v1/pastes/route"
import { createToken } from "@/lib/api/tokens"
import { DEFAULT_ACCOUNT_PASTES, DEFAULT_ACCOUNT_STORAGE_BYTES, getConfig } from "@/lib/config"
import { deleteForever, type SavePasteInput, savePaste, trashPaste } from "@/lib/pastes/actions"
import { storageUsage } from "@/lib/pastes/budget"
import { hasDatabase, resetDatabase, seedUser, signInAs } from "./harness"

// What one account may keep, set with ACCOUNT_PASTE_LIMIT and ACCOUNT_STORAGE_BYTES: the paste
// count and the combined size of current content, in the editor and through the token API.

const describeDb = hasDatabase ? describe : describe.skip

const KB = 1024
const PASTE_LIMIT_ERROR =
  "You've reached your paste limit. Permanently delete some pastes to create another."
const STORAGE_LIMIT_ERROR =
  "You've reached your storage limit. Permanently delete some pastes or reduce their size."

function input(content = "x", overrides: Partial<SavePasteInput> = {}): SavePasteInput {
  return {
    title: "Paste",
    description: "",
    files: [{ name: "a.txt", content }],
    visibility: "unlisted",
    expiry: "never",
    slug: "",
    collection: null,
    password: null,
    burnAfterRead: false,
    ...overrides,
  }
}

async function create(content = "x") {
  const result = await savePaste(input(content))
  if (!result.ok) throw new Error(result.error)
  return result.slug
}

const limitVariables = ["ACCOUNT_PASTE_LIMIT", "ACCOUNT_STORAGE_BYTES"]

function setLimits(limits: { pastes?: string; storage?: string }) {
  if (limits.pastes !== undefined) process.env.ACCOUNT_PASTE_LIMIT = limits.pastes
  if (limits.storage !== undefined) process.env.ACCOUNT_STORAGE_BYTES = limits.storage
}

afterEach(() => {
  for (const name of limitVariables) delete process.env[name]
})

describe("account limits in the configuration", () => {
  test("default to conservative values that fit a hosted sign-up", () => {
    const { accountLimits } = getConfig({})
    expect(accountLimits).toEqual({
      bytes: DEFAULT_ACCOUNT_STORAGE_BYTES,
      pastes: DEFAULT_ACCOUNT_PASTES,
    })
    expect(accountLimits.bytes).toBe(100 * 1024 * 1024)
    expect(accountLimits.pastes).toBe(1000)
  })

  test("take a size with units, plain bytes and a count", () => {
    expect(
      getConfig({ ACCOUNT_STORAGE_BYTES: "250MB", ACCOUNT_PASTE_LIMIT: "5000" }).accountLimits,
    ).toEqual({ bytes: 250 * 1024 * 1024, pastes: 5000 })
    expect(getConfig({ ACCOUNT_STORAGE_BYTES: "524288" }).accountLimits.bytes).toBe(524288)
    expect(getConfig({ ACCOUNT_STORAGE_BYTES: "1.5GB" }).accountLimits.bytes).toBe(1.5 * 1024 ** 3)
  })

  test("are removed by 0 or unlimited, in any case", () => {
    for (const value of ["0", "unlimited", "Unlimited", "none", "OFF"]) {
      expect(
        getConfig({ ACCOUNT_STORAGE_BYTES: value, ACCOUNT_PASTE_LIMIT: value }).accountLimits,
      ).toEqual({ bytes: null, pastes: null })
    }
  })

  test("fall back to the defaults when empty and name the variable when wrong", () => {
    expect(
      getConfig({ ACCOUNT_STORAGE_BYTES: "", ACCOUNT_PASTE_LIMIT: " " }).accountLimits,
    ).toEqual({
      bytes: DEFAULT_ACCOUNT_STORAGE_BYTES,
      pastes: DEFAULT_ACCOUNT_PASTES,
    })
    expect(() => getConfig({ ACCOUNT_STORAGE_BYTES: "lots" })).toThrow(
      /ACCOUNT_STORAGE_BYTES must be a size/,
    )
    expect(() => getConfig({ ACCOUNT_PASTE_LIMIT: "many" })).toThrow(
      /ACCOUNT_PASTE_LIMIT must be a whole number/,
    )
    expect(() => getConfig({ ACCOUNT_PASTE_LIMIT: "-5" })).toThrow(/ACCOUNT_PASTE_LIMIT/)
    expect(() => getConfig({ ACCOUNT_PASTE_LIMIT: "1.5" })).toThrow(/ACCOUNT_PASTE_LIMIT/)
  })
})

describeDb("account paste count limit", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("ada")
    await seedUser("bob")
    signInAs("ada")
  })

  test("refuses the paste after the last one allowed, with a message that says what to do", async () => {
    setLimits({ pastes: "2" })
    await create("one")
    await create("two")

    expect(await savePaste(input("three"))).toEqual({ ok: false, error: PASTE_LIMIT_ERROR })
    expect((await storageUsage()).pastes).toBe(2)
  })

  test("still lets the account edit the pastes it has", async () => {
    setLimits({ pastes: "2" })
    const first = await create("one")
    await create("two")

    const edited = await savePaste(input("one, edited", { expiry: "keep" }), first)
    expect(edited).toMatchObject({ ok: true, slug: first })
  })

  test("counts the trash until it is deleted for good", async () => {
    setLimits({ pastes: "2" })
    const first = await create("one")
    await create("two")

    await trashPaste(first)
    expect(await savePaste(input("three"))).toEqual({ ok: false, error: PASTE_LIMIT_ERROR })

    await deleteForever(first)
    expect(await savePaste(input("three"))).toMatchObject({ ok: true })
  })

  test("is counted per account", async () => {
    setLimits({ pastes: "1" })
    await create("ada's")
    expect(await savePaste(input("again"))).toMatchObject({ ok: false })

    signInAs("bob")
    expect(await savePaste(input("bob's"))).toMatchObject({ ok: true })
  })

  test("is lifted by unlimited", async () => {
    setLimits({ pastes: "unlimited" })
    for (const content of ["a", "b", "c", "d"]) await create(content)
    expect((await storageUsage()).pastes).toBe(4)
  })
})

describeDb("account storage limit", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("ada")
    await seedUser("bob")
    signInAs("ada")
  })

  test("refuses a paste that would take the account over, and accepts one that fits exactly", async () => {
    setLimits({ storage: String(3 * KB) })
    await create("a".repeat(KB))
    await create("b".repeat(KB))

    expect(await savePaste(input("c".repeat(KB + 1)))).toEqual({
      ok: false,
      error: STORAGE_LIMIT_ERROR,
    })
    expect(await savePaste(input("c".repeat(KB)))).toMatchObject({ ok: true })
    expect((await storageUsage()).bytes).toBe(3 * KB)
  })

  test("counts UTF-8 bytes rather than characters", async () => {
    setLimits({ storage: String(KB) })
    expect(await savePaste(input("é".repeat(KB / 2 + 1)))).toEqual({
      ok: false,
      error: STORAGE_LIMIT_ERROR,
    })
    expect(await savePaste(input("é".repeat(KB / 2)))).toMatchObject({ ok: true })
  })

  test("refuses an edit that grows past the limit and allows one that shrinks", async () => {
    setLimits({ storage: String(2 * KB) })
    const slug = await create("a".repeat(KB))
    await create("b".repeat(KB))

    const grown = await savePaste(input("a".repeat(KB + 1), { expiry: "keep" }), slug)
    expect(grown).toEqual({ ok: false, error: STORAGE_LIMIT_ERROR })

    const shrunk = await savePaste(input("a", { expiry: "keep" }), slug)
    expect(shrunk).toMatchObject({ ok: true })
    expect((await storageUsage()).bytes).toBe(KB + 1)
  })

  test("lets an account that is already over the limit shrink a paste and delete", async () => {
    const slug = await create("a".repeat(2 * KB))
    setLimits({ storage: String(KB) })

    expect(await savePaste(input("a".repeat(2 * KB), { expiry: "keep" }), slug)).toMatchObject({
      ok: true,
    })
    expect(await savePaste(input("a".repeat(KB + 1), { expiry: "keep" }), slug)).toMatchObject({
      ok: true,
    })
    expect(await savePaste(input("new"))).toMatchObject({ ok: false })

    await trashPaste(slug)
    expect((await storageUsage()).bytes).toBe(KB + 1)
    await deleteForever(slug)
    expect(await savePaste(input("new"))).toMatchObject({ ok: true })
  })

  test("is counted per account", async () => {
    setLimits({ storage: String(KB) })
    await create("a".repeat(KB))
    expect(await savePaste(input("more"))).toMatchObject({ ok: false })

    signInAs("bob")
    expect(await savePaste(input("b".repeat(KB)))).toMatchObject({ ok: true })
  })

  test("is lifted by unlimited", async () => {
    setLimits({ storage: "unlimited" })
    await create("a".repeat(512 * KB))
    await create("b".repeat(512 * KB))
    expect((await storageUsage()).bytes).toBe(1024 * KB)
    expect((await storageUsage()).limit.bytes).toBeNull()
  })
})

describeDb("account limits through the token API", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("ada")
  })

  async function token() {
    const result = await createToken("ada", { name: "cli", write: true, expiry: "never" })
    if (!result.ok) throw new Error(result.error)
    return result.token
  }

  function post(bearer: string, content: string) {
    return createCapture(
      new Request("http://localhost:3000/api/v1/pastes", {
        method: "POST",
        headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
        body: JSON.stringify({ title: "Capture", files: [{ name: "a.txt", content }] }),
      }),
    )
  }

  test("answers 413 with the paste limit message once the count is used up", async () => {
    setLimits({ pastes: "1" })
    const bearer = await token()
    expect((await post(bearer, "one")).status).toBe(201)

    const refused = await post(bearer, "two")
    expect(refused.status).toBe(413)
    expect(await refused.json()).toEqual({
      ok: false,
      error: PASTE_LIMIT_ERROR,
      code: "payload_too_large",
      message: PASTE_LIMIT_ERROR,
      resolution: "Reduce the request or stored content and try again.",
    })
  })

  test("answers 413 with the storage limit message when a capture doesn't fit", async () => {
    setLimits({ storage: String(KB) })
    const bearer = await token()
    expect((await post(bearer, "a".repeat(KB))).status).toBe(201)

    const refused = await post(bearer, "b")
    expect(refused.status).toBe(413)
    expect(await refused.json()).toEqual({
      ok: false,
      error: STORAGE_LIMIT_ERROR,
      code: "payload_too_large",
      message: STORAGE_LIMIT_ERROR,
      resolution: "Reduce the request or stored content and try again.",
    })
  })

  test("checks replacements too, and lets them shrink", async () => {
    setLimits({ storage: String(KB) })
    const bearer = await token()
    const created = await (await post(bearer, "a".repeat(KB))).json()
    const id = created.paste.id
    const put = (content: string) =>
      updateCapture(
        new Request(`http://localhost:3000/api/v1/pastes/${id}`, {
          method: "PUT",
          headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
          body: JSON.stringify({ title: "Capture", files: [{ name: "a.txt", content }] }),
        }),
        { params: Promise.resolve({ id }) } as never,
      )

    const grown = await put("a".repeat(KB + 1))
    expect(grown.status).toBe(413)
    expect(await grown.json()).toEqual({
      ok: false,
      error: STORAGE_LIMIT_ERROR,
      code: "payload_too_large",
      message: STORAGE_LIMIT_ERROR,
      resolution: "Reduce the request or stored content and try again.",
    })
    expect((await put("a")).status).toBe(200)
  })

  test("accepts everything when the limits are off", async () => {
    setLimits({ pastes: "unlimited", storage: "unlimited" })
    const bearer = await token()
    for (const content of ["one", "two", "three"]) {
      expect((await post(bearer, content)).status).toBe(201)
    }
  })
})
