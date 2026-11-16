// The contract between Sniptide and an external service a user connects, such as GitHub. A new
// service is one adapter that satisfies `IntegrationProvider`, listed in ./providers.ts.
// Connecting, storing tokens, renewing them, disconnecting and the Settings row come from the
// framework around it.

export type Failure = { ok: false; error: string; unauthorized?: boolean }

export interface OAuthCredentials {
  clientId: string
  clientSecret: string
}

export interface ImportFile {
  name: string
  size: number
  // Inline text, when the provider sent the whole file.
  content: string | null
  // Where to fetch the text when it wasn't sent inline. Adapters only set URLs on hosts they trust.
  rawUrl: string | null
  // Why the file can't be imported, or null.
  skipped: string | null
}

export interface ImportOwner {
  login: string
  avatarUrl: string | null
  url: string
}

// Something that becomes one paste, such as a gist.
export interface ImportItem {
  id: string
  owner: ImportOwner | null
  description: string | null
  files: ImportFile[]
}

// A row in the list of things the connected account can import.
export interface ImportSummary {
  id: string
  title: string
  files: number
  public: boolean
  updatedAt: string | null
}

// Reading from the service. `token` is the connected account's access token, or null when the
// user hasn't connected: adapters that can read public items without one still do. A failure with
// `unauthorized` means the service refused the token, and the framework drops the connection.
export interface ImportSource {
  // The item id in a link or a bare id. Null for anything else.
  parseId(input: string): string | null
  fetch(id: string, token: string | null): Promise<{ ok: true; item: ImportItem } | Failure>
  // The connected account's own items, newest first. `page` starts at 1.
  list(
    token: string,
    page: number,
  ): Promise<{ ok: true; items: ImportSummary[]; nextPage: number | null } | Failure>
  // What a paste made from the item is called when it has no description or files to name it by.
  fallbackTitle: string
  // The description a paste made from the item starts with.
  describe(item: ImportItem): string
}

// Writing a paste to the service. No adapter implements it yet.
export interface ExportTarget {
  create(
    token: string,
    paste: { title: string; public: boolean; files: { name: string; content: string }[] },
  ): Promise<{ ok: true; url: string } | Failure>
}

export interface IntegrationProvider {
  // Stored with every connection, so it never changes once released.
  id: string
  name: string
  oauth: {
    authorizeUrl: string
    tokenUrl: string
    scopes: string[]
    // Null when the server has no OAuth app for the service. Settings then shows it as not set up.
    credentials(): OAuthCredentials | null
    // Where the service sends the user back. Defaults to /api/integrations/<id>/callback.
    callbackPath?: string
  }
  // Who the token belongs to, or null when the service doesn't say.
  account(token: string): Promise<{ id: string; name: string } | null>
  // Ends the token at the service when the user disconnects.
  revoke?(token: string, credentials: OAuthCredentials): Promise<void>
  imports?: ImportSource
  exports?: ExportTarget
}
