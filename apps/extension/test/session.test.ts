import { describe, expect, test } from "bun:test"
import { fakeInstance, INSTANCE, REDIRECT } from "@workspace/oauth-client/testing"
import { createSessions, type Session, SignedOutError } from "../src/lib/session"

function setup() {
  const instance = fakeInstance()
  let stored: Session | null = null
  let now = Date.parse("2026-11-13T12:00:00Z")
  const sessions = createSessions({
    storage: {
      get: async () => stored,
      set: async (session) => {
        stored = session
      },
    },
    fetch: instance.fetch,
    redirectUri: REDIRECT,
    authorize: instance.authorize,
    now: () => now,
  })
  return {
    instance,
    sessions,
    stored: () => stored,
    advance: (ms: number) => {
      now += ms
    },
  }
}

const create = (sessions: ReturnType<typeof setup>["sessions"]) =>
  sessions.run((client) =>
    client.createPaste({ title: "t", files: [{ name: "a.txt", content: "a" }] }),
  )

describe("signing in", () => {
  test("registers, exchanges the code and stores the account", async () => {
    const { sessions, stored, instance } = setup()
    expect(await sessions.signIn(INSTANCE)).toEqual({
      instance: INSTANCE,
      name: "Ada Lovelace",
      username: "ada",
      canWrite: true,
    })
    expect(stored()?.clientId).toBe("sntc_1")
    expect(stored()?.expiresAt).toBe(Date.parse("2026-11-13T13:00:00Z"))
    expect(await sessions.account()).toMatchObject({ username: "ada" })
    expect(instance.state.requests).toEqual([
      "GET /.well-known/oauth-authorization-server",
      "POST /api/oauth/register",
      "POST /api/oauth/token",
      "GET /api/v1/me",
    ])
  })

  test("stores nothing when the reader closes the consent window", async () => {
    const { instance } = setup()
    const writes: (Session | null)[] = []
    const sessions = createSessions({
      storage: {
        get: async () => null,
        set: async (session) => {
          writes.push(session)
        },
      },
      fetch: instance.fetch,
      redirectUri: REDIRECT,
      authorize: async () => {
        throw new Error("closed")
      },
    })
    await expect(sessions.signIn(INSTANCE)).rejects.toThrow("closed")
    expect(writes).toEqual([])
  })

  test("records a read-only connection as unable to write", async () => {
    const { sessions, instance } = setup()
    instance.state.scope = "read"
    expect((await sessions.signIn(INSTANCE)).canWrite).toBe(false)
  })

  test("signing in again ends the connection it replaces", async () => {
    const { sessions, stored, instance } = setup()
    await sessions.signIn(INSTANCE)
    const first = stored()?.refreshToken
    await sessions.signIn(INSTANCE)
    expect(instance.state.revoked).toEqual([first as string])
  })
})

describe("calling the API", () => {
  test("refuses before sign-in", async () => {
    await expect(create(setup().sessions)).rejects.toBeInstanceOf(SignedOutError)
  })

  test("uses the stored token while it is fresh", async () => {
    const { sessions, instance } = setup()
    await sessions.signIn(INSTANCE)
    instance.state.requests.length = 0
    expect((await create(sessions)).paste.id).toBe("p1")
    expect(instance.state.requests).toEqual(["POST /api/v1/pastes"])
  })

  test("renews a token about to lapse and stores the rotated refresh token", async () => {
    const { sessions, instance, stored, advance } = setup()
    await sessions.signIn(INSTANCE)
    const before = stored() as Session
    advance(59.5 * 60_000)
    instance.state.requests.length = 0
    await create(sessions)
    expect(instance.state.requests).toEqual(["POST /api/oauth/token", "POST /api/v1/pastes"])
    expect(stored()?.refreshToken).not.toBe(before.refreshToken)
    expect(stored()?.accessToken).not.toBe(before.accessToken)
  })

  test("two requests at once share one renewal", async () => {
    const { sessions, instance, advance } = setup()
    await sessions.signIn(INSTANCE)
    advance(61 * 60_000)
    instance.state.requests.length = 0
    await Promise.all([create(sessions), create(sessions)])
    expect(
      instance.state.requests.filter((request) => request === "POST /api/oauth/token"),
    ).toHaveLength(1)
    expect(instance.state.pastes).toBe(2)
  })

  test("renews once and retries when the server rejects the access token", async () => {
    const { sessions, instance, stored } = setup()
    await sessions.signIn(INSTANCE)
    instance.state.access.clear()
    instance.state.requests.length = 0
    expect((await create(sessions)).paste.id).toBe("p1")
    expect(instance.state.requests).toEqual([
      "POST /api/v1/pastes",
      "POST /api/oauth/token",
      "POST /api/v1/pastes",
    ])
    expect(instance.state.access.has(stored()?.accessToken as string)).toBe(true)
  })

  test("signs the reader out when the connection was revoked", async () => {
    const { sessions, instance, stored } = setup()
    await sessions.signIn(INSTANCE)
    instance.state.access.clear()
    instance.state.refresh.clear()
    await expect(create(sessions)).rejects.toThrow("Your Sniptide connection ended.")
    expect(stored()).toBeNull()
  })

  test("keeps the connection when the renewal can't reach the server", async () => {
    const { instance } = setup()
    let stored: Session | null = null
    let online = true
    let now = Date.parse("2026-11-13T12:00:00Z")
    const sessions = createSessions({
      storage: {
        get: async () => stored,
        set: async (session) => {
          stored = session
        },
      },
      fetch: ((input: RequestInfo | URL, init?: RequestInit) => {
        if (!online) throw new TypeError("offline")
        return instance.fetch(input, init)
      }) as typeof fetch,
      redirectUri: REDIRECT,
      authorize: instance.authorize,
      now: () => now,
    })
    await sessions.signIn(INSTANCE)
    now += 61 * 60_000
    online = false
    await expect(create(sessions)).rejects.toMatchObject({ code: "network" })
    expect(stored).not.toBeNull()
  })
})

test("signing out clears the tokens and revokes the connection", async () => {
  const { sessions, instance, stored } = setup()
  await sessions.signIn(INSTANCE)
  const refresh = stored()?.refreshToken
  await sessions.signOut()
  expect(stored()).toBeNull()
  expect(instance.state.revoked).toEqual([refresh as string])
  expect(await sessions.account()).toBeNull()
})
