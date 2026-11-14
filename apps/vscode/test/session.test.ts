import { describe, expect, test } from "bun:test"
import { fakeInstance, INSTANCE } from "@workspace/oauth-client/testing"
import { CLIENT_NAME, createSessions, type Session, SignedOutError } from "../src/lib/session"

// What asExternalUri gives a desktop editor: its own scheme, with a query Sniptide must keep.
const REDIRECT = "vscode://sniptide.sniptide-vscode/oauth?windowId=1"

// One editor window: its own copy of the extension on the storage every window shares.
function windowOn(
  instance: ReturnType<typeof fakeInstance>,
  storage: { value: Session | null },
  clock: { now: number },
  fetcher: typeof fetch = instance.fetch,
) {
  return createSessions({
    storage: {
      get: async () => storage.value,
      set: async (session) => {
        storage.value = session
      },
    },
    fetch: fetcher,
    redirectUri: async () => REDIRECT,
    // The editor hands the extension the query of the address Sniptide redirected to.
    authorize: async (url) => new URL(await instance.authorize(url)).search.slice(1),
    now: () => clock.now,
  })
}

function setup() {
  const instance = fakeInstance()
  const storage = { value: null as Session | null }
  const clock = { now: Date.parse("2026-11-14T12:00:00Z") }
  return {
    instance,
    storage,
    clock,
    sessions: windowOn(instance, storage, clock),
    oauth: () => {
      if (storage.value?.kind !== "oauth") throw new Error("No OAuth session is stored.")
      return storage.value
    },
  }
}

type Sessions = ReturnType<typeof setup>["sessions"]
const create = (sessions: Sessions) =>
  sessions.run((client) =>
    client.createPaste({ title: "t", files: [{ name: "a.txt", content: "a" }] }),
  )

// A personal API token the instance accepts.
function issueToken(instance: ReturnType<typeof fakeInstance>) {
  const token = "snpt_personal_token_0001"
  instance.state.access.add(token)
  return token
}

describe("signing in through the browser", () => {
  test("registers under the extension's name, exchanges the code and stores the account", async () => {
    const { sessions, instance, oauth } = setup()
    expect(await sessions.signIn(INSTANCE)).toEqual({
      instance: INSTANCE,
      name: "Ada Lovelace",
      username: "ada",
      canWrite: true,
      method: "oauth",
    })
    expect(instance.state.clients.get(oauth().clientId)).toBe(CLIENT_NAME)
    expect(oauth().expiresAt).toBe(Date.parse("2026-11-14T13:00:00Z"))
    expect(instance.state.requests).toEqual([
      "GET /.well-known/oauth-authorization-server",
      "POST /api/oauth/register",
      "POST /api/oauth/token",
      "GET /api/v1/me",
    ])
  })

  test("stores nothing when the reader cancels in the editor", async () => {
    const { instance, storage, clock } = setup()
    const sessions = createSessions({
      storage: {
        get: async () => storage.value,
        set: async () => {
          throw new Error("Nothing should be stored.")
        },
      },
      fetch: instance.fetch,
      redirectUri: async () => REDIRECT,
      authorize: async () => {
        throw new Error("cancelled")
      },
      now: () => clock.now,
    })
    await expect(sessions.signIn(INSTANCE)).rejects.toThrow("cancelled")
  })

  test("refuses a redirect that answers another sign-in", async () => {
    const { instance, storage, clock } = setup()
    const sessions = createSessions({
      storage: { get: async () => storage.value, set: async () => {} },
      fetch: instance.fetch,
      redirectUri: async () => REDIRECT,
      authorize: async () => "code=stolen&state=other",
      now: () => clock.now,
    })
    await expect(sessions.signIn(INSTANCE)).rejects.toMatchObject({ code: "state" })
  })

  test("records a read-only connection as unable to write", async () => {
    const { sessions, instance } = setup()
    instance.state.scope = "read"
    expect((await sessions.signIn(INSTANCE)).canWrite).toBe(false)
  })

  test("signing in again ends the connection it replaces", async () => {
    const { sessions, instance, oauth } = setup()
    await sessions.signIn(INSTANCE)
    const first = oauth().refreshToken
    await sessions.signIn(INSTANCE)
    expect(instance.state.revoked).toEqual([first])
  })
})

describe("signing in with an API token", () => {
  test("checks the token against the instance before storing it", async () => {
    const { sessions, instance, storage } = setup()
    const token = issueToken(instance)
    expect(await sessions.signInWithToken(INSTANCE, ` ${token}\n`)).toMatchObject({
      username: "ada",
      method: "token",
    })
    expect(storage.value).toMatchObject({ kind: "token", accessToken: token })
    expect(instance.state.requests).toEqual(["GET /api/v1/me"])
  })

  test("stores nothing for a token the instance rejects", async () => {
    const { sessions, storage } = setup()
    await expect(sessions.signInWithToken(INSTANCE, "snpt_wrong")).rejects.toMatchObject({
      status: 401,
    })
    expect(storage.value).toBeNull()
  })

  test("signs the reader out when the token stops working", async () => {
    const { sessions, instance, storage } = setup()
    await sessions.signInWithToken(INSTANCE, issueToken(instance))
    instance.state.access.clear()
    await expect(create(sessions)).rejects.toThrow("Your API token stopped working.")
    expect(storage.value).toBeNull()
  })

  test("replaces an OAuth connection and ends it on the server", async () => {
    const { sessions, instance, oauth } = setup()
    await sessions.signIn(INSTANCE)
    const refresh = oauth().refreshToken
    await sessions.signInWithToken(INSTANCE, issueToken(instance))
    expect(instance.state.revoked).toEqual([refresh])
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
    const { sessions, instance, oauth, clock } = setup()
    await sessions.signIn(INSTANCE)
    const before = oauth()
    clock.now += 59.5 * 60_000
    instance.state.requests.length = 0
    await create(sessions)
    expect(instance.state.requests).toEqual(["POST /api/oauth/token", "POST /api/v1/pastes"])
    expect(oauth().refreshToken).not.toBe(before.refreshToken)
    expect(oauth().accessToken).not.toBe(before.accessToken)
  })

  test("two requests at once share one renewal", async () => {
    const { sessions, instance, clock } = setup()
    await sessions.signIn(INSTANCE)
    clock.now += 61 * 60_000
    instance.state.requests.length = 0
    await Promise.all([create(sessions), create(sessions)])
    expect(
      instance.state.requests.filter((request) => request === "POST /api/oauth/token"),
    ).toHaveLength(1)
    expect(instance.state.pastes).toBe(2)
  })

  test("renews once and retries when the server rejects the access token", async () => {
    const { sessions, instance, oauth } = setup()
    await sessions.signIn(INSTANCE)
    instance.state.access.clear()
    instance.state.requests.length = 0
    expect((await create(sessions)).paste.id).toBe("p1")
    expect(instance.state.requests).toEqual([
      "POST /api/v1/pastes",
      "POST /api/oauth/token",
      "POST /api/v1/pastes",
    ])
    expect(instance.state.access.has(oauth().accessToken)).toBe(true)
  })

  test("signs the reader out when the connection was revoked", async () => {
    const { sessions, instance, storage } = setup()
    await sessions.signIn(INSTANCE)
    instance.state.access.clear()
    instance.state.refresh.clear()
    await expect(create(sessions)).rejects.toThrow("Your Sniptide connection ended.")
    expect(storage.value).toBeNull()
  })

  test("keeps the connection when the renewal can't reach the server", async () => {
    const { instance, storage, clock } = setup()
    let online = true
    const sessions = windowOn(instance, storage, clock, ((
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      if (!online) throw new TypeError("offline")
      return instance.fetch(input, init)
    }) as typeof fetch)
    await sessions.signIn(INSTANCE)
    clock.now += 61 * 60_000
    online = false
    await expect(create(sessions)).rejects.toMatchObject({ code: "network" })
    expect(storage.value).not.toBeNull()
  })
})

describe("several editor windows on one stored session", () => {
  test("a window whose refresh token another window already used continues with its tokens", async () => {
    const { sessions: first, instance, storage, clock, oauth } = setup()
    await first.signIn(INSTANCE)
    const stale = oauth()
    // The second window holds the session in memory, mid-request, while the first renews.
    let release: (session: Session | null) => void = () => {}
    const held = new Promise<Session | null>((resolve) => {
      release = resolve
    })
    let reads = 0
    const second = createSessions({
      storage: {
        get: async () => (reads++ === 0 ? held : storage.value),
        set: async (session) => {
          storage.value = session
        },
      },
      fetch: instance.fetch,
      redirectUri: async () => REDIRECT,
      authorize: async () => "",
      now: () => clock.now,
    })
    clock.now += 61 * 60_000
    const late = create(second)
    await create(first)
    release(stale)
    expect((await late).paste.id).toBe("p2")
    expect(storage.value).not.toBeNull()
    expect(oauth().refreshToken).not.toBe(stale.refreshToken)
  })

  test("a sign-out in one window signs the others out on their next request", async () => {
    const { sessions: first, instance, storage, clock } = setup()
    const second = windowOn(instance, storage, clock)
    await first.signIn(INSTANCE)
    await first.signOut()
    await expect(create(second)).rejects.toBeInstanceOf(SignedOutError)
  })
})

test("signing out clears the tokens and revokes the connection", async () => {
  const { sessions, instance, storage, oauth } = setup()
  await sessions.signIn(INSTANCE)
  const refresh = oauth().refreshToken
  await sessions.signOut()
  expect(storage.value).toBeNull()
  expect(instance.state.revoked).toEqual([refresh])
  expect(await sessions.account()).toBeNull()
})
