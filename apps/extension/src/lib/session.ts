import { SniptideClient, SniptideError } from "@sniptide/sdk"
import {
  authorizationUrl,
  createPkce,
  discover,
  type Endpoints,
  exchangeCode,
  OAuthError,
  randomToken,
  readCallback,
  refreshTokens,
  registerClient,
  revoke,
  type TokenSet,
} from "./oauth"
import type { Account } from "./protocol"

// The signed-in connection: its tokens, the client it registered as and the account behind it.
// Storage, fetch and the browser's sign-in window are passed in, so the token handling runs under
// test without chrome.*.

export interface Session extends TokenSet {
  instance: string
  clientId: string
  endpoints: Endpoints
  account: Account
}

export interface SessionStorage {
  get(): Promise<Session | null>
  set(session: Session | null): Promise<void>
}

export interface SessionDeps {
  storage: SessionStorage
  fetch: typeof fetch
  redirectUri: string
  // Opens the consent screen and resolves with the address Sniptide redirected back to.
  authorize(url: string): Promise<string>
  now?: () => number
}

export class SignedOutError extends Error {
  code = "signed_out"
  constructor(message = "Sign in to Sniptide first.") {
    super(message)
    this.name = "SignedOutError"
  }
}

// Renew a minute early, so a request never leaves with a token about to lapse.
const RENEW_MARGIN_MS = 60_000

export function createSessions(deps: SessionDeps) {
  const now = deps.now ?? Date.now
  let renewing: Promise<Session> | null = null

  async function renew(session: Session): Promise<Session> {
    // One renewal at a time: the refresh token works once, and a second use ends the connection.
    renewing ??= (async () => {
      try {
        const tokens = await refreshTokens(deps.fetch, session.endpoints, session, now())
        const next = { ...session, ...tokens }
        await deps.storage.set(next)
        return next
      } catch (error) {
        // The server ended the grant (revoked, expired or reused), so the reader signs in again.
        if (error instanceof OAuthError && error.code !== "network") {
          await deps.storage.set(null)
          throw new SignedOutError("Your Sniptide connection ended. Sign in again.")
        }
        throw error
      } finally {
        renewing = null
      }
    })()
    return renewing
  }

  async function current() {
    const session = await deps.storage.get()
    if (!session) throw new SignedOutError()
    return session.expiresAt - now() < RENEW_MARGIN_MS ? renew(session) : session
  }

  const client = (session: Session) =>
    new SniptideClient(session.accessToken, session.instance, deps.fetch)

  return {
    async account() {
      return (await deps.storage.get())?.account ?? null
    },

    // Runs `call` with a client for the signed-in account. A 401 means the access token was
    // revoked or lapsed early, so it renews once and tries again.
    async run<T>(call: (client: SniptideClient) => Promise<T>): Promise<T> {
      const session = await current()
      try {
        return await call(client(session))
      } catch (error) {
        if (!(error instanceof SniptideError) || error.status !== 401) throw error
        const stored = await deps.storage.get()
        if (!stored) throw new SignedOutError()
        // Another request may have renewed already; its token is the one to retry with.
        const next = stored.accessToken === session.accessToken ? await renew(stored) : stored
        return call(client(next))
      }
    },

    async signIn(instance: string): Promise<Account> {
      const endpoints = await discover(deps.fetch, instance)
      const clientId = await registerClient(deps.fetch, endpoints, deps.redirectUri)
      const { verifier, challenge } = await createPkce()
      const state = randomToken(16)
      const callback = await deps.authorize(
        authorizationUrl(endpoints, { clientId, redirectUri: deps.redirectUri, challenge, state }),
      )
      const code = readCallback(callback, { state, instance })
      const tokens = await exchangeCode(
        deps.fetch,
        endpoints,
        { clientId, redirectUri: deps.redirectUri, code, verifier },
        now(),
      )
      const me = await new SniptideClient(tokens.accessToken, instance, deps.fetch).me()
      const account: Account = {
        instance,
        name: me.user.name,
        username: me.user.username,
        canWrite: me.scopes.includes("write"),
      }
      const previous = await deps.storage.get()
      await deps.storage.set({ ...tokens, instance, clientId, endpoints, account })
      if (previous)
        await revoke(deps.fetch, previous.endpoints, previous.clientId, previous.refreshToken)
      return account
    },

    async signOut() {
      const session = await deps.storage.get()
      await deps.storage.set(null)
      if (session)
        await revoke(deps.fetch, session.endpoints, session.clientId, session.refreshToken)
    },
  }
}
