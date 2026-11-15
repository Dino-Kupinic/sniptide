import {
  createSessions as create,
  type OAuthSession,
  type SessionDeps,
} from "@workspace/oauth-client/sessions"

export { SignedOutError } from "@workspace/oauth-client/sessions"

// What the consent screen and the connection list in Settings call the extension.
const CLIENT_NAME = "Sniptide for Chrome"

// The extension signs in through OAuth only, so every session it stores is an OAuth session.
export type Session = OAuthSession

export interface ExtensionSessionDeps extends Omit<SessionDeps, "clientName" | "storage"> {
  storage: {
    get(): Promise<Session | null>
    set(session: Session | null): Promise<void>
  }
}

// The extension's signed-in connection. The background worker passes storage, fetch and the
// browser's sign-in window, so the token handling runs under test without chrome.*.
export function createSessions(deps: ExtensionSessionDeps) {
  return create({ ...deps, clientName: CLIENT_NAME })
}
