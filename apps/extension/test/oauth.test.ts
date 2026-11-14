import { describe, expect, test } from "bun:test"
import {
  authorizationUrl,
  createPkce,
  discover,
  instanceOrigin,
  OAuthError,
  readCallback,
} from "../src/lib/oauth"
import { fakeInstance, INSTANCE, REDIRECT } from "./fake-instance"

describe("instanceOrigin", () => {
  test("accepts a host, a full address and a local instance", () => {
    expect(instanceOrigin(" paste.example.com ")).toBe("https://paste.example.com")
    expect(instanceOrigin("https://paste.example.com/dashboard?x=1")).toBe(
      "https://paste.example.com",
    )
    expect(instanceOrigin("http://localhost:3000")).toBe("http://localhost:3000")
  })

  test("refuses plain http away from this machine, credentials and nonsense", () => {
    expect(() => instanceOrigin("http://paste.example.com")).toThrow(OAuthError)
    expect(() => instanceOrigin("https://ada:secret@paste.example.com")).toThrow(OAuthError)
    expect(() => instanceOrigin("ftp://paste.example.com")).toThrow(OAuthError)
    expect(() => instanceOrigin("")).toThrow(OAuthError)
    expect(() => instanceOrigin("https://")).toThrow(OAuthError)
  })
})

describe("discover", () => {
  test("reads the endpoints from the instance's metadata", async () => {
    const instance = fakeInstance()
    expect(await discover(instance.fetch, INSTANCE)).toEqual({
      authorization: `${INSTANCE}/oauth/authorize`,
      token: `${INSTANCE}/api/oauth/token`,
      registration: `${INSTANCE}/api/oauth/register`,
      revocation: `${INSTANCE}/api/oauth/revoke`,
    })
  })

  test("refuses metadata that sends tokens to another origin", async () => {
    const instance = fakeInstance()
    instance.state.metadata.token_endpoint = "https://evil.test/api/oauth/token"
    await expect(discover(instance.fetch, INSTANCE)).rejects.toThrow(
      "No Sniptide instance answers at that address.",
    )
  })

  test("refuses metadata issued for another instance", async () => {
    const instance = fakeInstance()
    instance.state.metadata.issuer = "https://other.test"
    await expect(discover(instance.fetch, INSTANCE)).rejects.toThrow(OAuthError)
  })

  test("says so when the address can't be reached", async () => {
    const offline = (async () => {
      throw new TypeError("fetch failed")
    }) as unknown as typeof fetch
    await expect(discover(offline, INSTANCE)).rejects.toMatchObject({ code: "network" })
  })
})

test("the authorization request carries PKCE, both scopes and the state", async () => {
  const instance = fakeInstance()
  const endpoints = await discover(instance.fetch, INSTANCE)
  const { verifier, challenge } = await createPkce()
  const url = new URL(
    authorizationUrl(endpoints, {
      clientId: "sntc_1",
      redirectUri: REDIRECT,
      challenge,
      state: "s",
    }),
  )
  expect(verifier).not.toBe(challenge)
  // The server only accepts a 43-character S256 challenge.
  expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(Object.fromEntries(url.searchParams)).toEqual({
    response_type: "code",
    client_id: "sntc_1",
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: "S256",
    scope: "read write",
    state: "s",
  })
})

describe("readCallback", () => {
  const expected = { state: "s1", instance: INSTANCE }

  test("returns the code from a matching redirect", () => {
    expect(readCallback(`${REDIRECT}?code=c1&state=s1&iss=${INSTANCE}`, expected)).toBe("c1")
  })

  test("refuses a redirect for another sign-in or from another server", () => {
    expect(() => readCallback(`${REDIRECT}?code=c1&state=other`, expected)).toThrow(
      "doesn't match this request",
    )
    expect(() =>
      readCallback(`${REDIRECT}?code=c1&state=s1&iss=https://evil.test`, expected),
    ).toThrow("another server")
  })

  test("reports a refusal and a server error", () => {
    expect(() => readCallback(`${REDIRECT}?error=access_denied&state=s1`, expected)).toThrow(
      "Access wasn't allowed.",
    )
    expect(() =>
      readCallback(`${REDIRECT}?error=invalid_scope&error_description=Nope.&state=s1`, expected),
    ).toThrow("Nope.")
  })
})
