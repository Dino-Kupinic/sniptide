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
} from "@workspace/oauth-client"
import { messages } from "./messages"

// The signed-in connection: an OAuth grant or a pasted API token, and the account behind it.
// Storage, fetch and the trip through the browser are passed in, so the token handling runs under
// test without the editor.

// What the consent screen and the connection list in Settings call the extension.
export const CLIENT_NAME = "Sniptide for VS Code"

export interface Account {
  instance: string
  name: string
  username: string | null
  canWrite: boolean
  method: "oauth" | "token"
}

export interface OAuthSession extends TokenSet {
  kind: "oauth"
  instance: string
  clientId: string
  endpoints: Endpoints
  account: Account
}

export interface TokenSession {
  kind: "token"
  instance: string
  accessToken: string
  account: Account
}

export type Session = OAuthSession | TokenSession

export interface SessionStorage {
  get(): Promise<Session | null>
  set(session: Session | null): Promise<void>
}

export interface SessionDeps {
  storage: SessionStorage
  fetch: typeof fetch
  // The address Sniptide sends the reader back to. The editor decides it per sign-in.
  redirectUri(): Promise<string>
  // Opens the consent screen and resolves with the query string Sniptide redirected back with.
  authorize(url: string): Promise<string>
  now?: () => number
}

export class SignedOutError extends Error {
  code = "signed_out"
  constructor(message = messages.signInFirst) {
    super(message)
    this.name = "SignedOutError"
  }
}

// Renew a minute early, so a request never leaves with a token about to lapse.
const RENEW_MARGIN_MS = 60_000

export function createSessions(deps: SessionDeps) {
  const now = deps.now ?? Date.now
  let renewing: Promise<OAuthSession> | null = null

  async function renew(session: OAuthSession): Promise<OAuthSession> {
    // One renewal at a time: the refresh token works once, and a second use ends the connection.
    renewing ??= (async () => {
      try {
        const tokens = await refreshTokens(deps.fetch, session.endpoints, session, now())
        const next = { ...session, ...tokens }
        await deps.storage.set(next)
        return next
      } catch (error) {
        if (!(error instanceof OAuthError) || error.code === "network") throw error
        // Every editor window runs its own copy of the extension on the same stored session. When
        // another window renewed first, its tokens are in storage and this window continues with
        // them. Otherwise the server ended the grant and the reader signs in again.
        const stored = await deps.storage.get()
        if (stored?.kind === "oauth" && stored.refreshToken !== session.refreshToken) return stored
        await deps.storage.set(null)
        throw new SignedOutError(messages.connectionEnded)
      } finally {
        renewing = null
      }
    })()
    return renewing
  }

  async function current(): Promise<Session> {
    const session = await deps.storage.get()
    if (!session) throw new SignedOutError()
    if (session.kind === "token") return session
    return session.expiresAt - now() < RENEW_MARGIN_MS ? renew(session) : session
  }

  const client = (session: Pick<Session, "accessToken" | "instance">) =>
    new SniptideClient(session.accessToken, session.instance, deps.fetch)

  async function accountOf(
    instance: string,
    accessToken: string,
    method: Account["method"],
  ): Promise<Account> {
    const me = await client({ instance, accessToken }).me()
    return {
      instance,
      name: me.user.name,
      username: me.user.username,
      canWrite: me.scopes.includes("write"),
      method,
    }
  }

  // Replaces the stored session and ends the OAuth grant it replaces on the server.
  async function replace(next: Session | null) {
    const previous = await deps.storage.get()
    await deps.storage.set(next)
    if (previous?.kind === "oauth")
      await revoke(deps.fetch, previous.endpoints, previous.clientId, previous.refreshToken)
  }

  return {
    async account() {
      return (await deps.storage.get())?.account ?? null
    },

    // Runs `call` with a client for the signed-in account. A 401 means the access token was
    // revoked or lapsed early: an OAuth session renews once and tries again, and a pasted token
    // can't be renewed, so the reader signs in again.
    async run<T>(call: (client: SniptideClient) => Promise<T>): Promise<T> {
      const session = await current()
      try {
        return await call(client(session))
      } catch (error) {
        if (!(error instanceof SniptideError) || error.status !== 401) throw error
        const stored = await deps.storage.get()
        if (!stored) throw new SignedOutError()
        if (stored.kind === "token") {
          // Another window may have signed in again with a token that works.
          if (stored.accessToken !== session.accessToken) return call(client(stored))
          await deps.storage.set(null)
          throw new SignedOutError(messages.tokenStopped)
        }
        // Another request may have renewed already; its token is the one to retry with.
        const next = stored.accessToken === session.accessToken ? await renew(stored) : stored
        return call(client(next))
      }
    },

    async signIn(instance: string): Promise<Account> {
      const endpoints = await discover(deps.fetch, instance)
      const redirectUri = await deps.redirectUri()
      const clientId = await registerClient(deps.fetch, endpoints, {
        name: CLIENT_NAME,
        redirectUri,
      })
      const { verifier, challenge } = await createPkce()
      const state = randomToken(16)
      const query = await deps.authorize(
        authorizationUrl(endpoints, { clientId, redirectUri, challenge, state }),
      )
      const code = readCallback(`https://callback.invalid/?${query}`, { state, instance })
      const tokens = await exchangeCode(
        deps.fetch,
        endpoints,
        { clientId, redirectUri, code, verifier },
        now(),
      )
      const account = await accountOf(instance, tokens.accessToken, "oauth")
      await replace({ kind: "oauth", ...tokens, instance, clientId, endpoints, account })
      return account
    },

    // Signs in with a personal API token. `me` proves the token works on this instance before
    // anything is stored.
    async signInWithToken(instance: string, token: string): Promise<Account> {
      const accessToken = token.trim()
      const account = await accountOf(instance, accessToken, "token")
      await replace({ kind: "token", instance, accessToken, account })
      return account
    },

    async signOut() {
      await replace(null)
    },
  }
}

export type Sessions = ReturnType<typeof createSessions>
