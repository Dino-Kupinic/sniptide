import { createSessions as create, type SessionDeps } from "@workspace/oauth-client/sessions"

export { type Account, type Session, SignedOutError } from "@workspace/oauth-client/sessions"

// What the consent screen and the connection list in Settings call the extension.
export const CLIENT_NAME = "Sniptide for VS Code"

export interface EditorSessionDeps extends Omit<SessionDeps, "clientName" | "authorize"> {
  // Opens the consent screen and resolves with the query string Sniptide redirected back with,
  // which is the part of the address the editor's URI handler passes on.
  authorize(url: string): Promise<string>
}

// The extension's signed-in connection. The editor passes storage, fetch and the trip through
// the browser, so the token handling runs under test without the editor.
export function createSessions(deps: EditorSessionDeps) {
  return create({
    ...deps,
    clientName: CLIENT_NAME,
    authorize: async (url) => `https://callback.invalid/?${await deps.authorize(url)}`,
  })
}
