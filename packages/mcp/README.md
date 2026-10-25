# Sniptide MCP server

Connect a coding agent to your Sniptide account. The same five tools work through the app's remote
HTTP endpoint or a local process that calls the token API. Both support Sniptide Cloud and
self-hosted instances. Create a personal API token in Settings → API tokens; use read-only access
for retrieval, or enable write access to save and edit snippets.

| Tool | What it returns or changes |
| --- | --- |
| `search_snippets` | Summary page filtered by title/slug (`query`), tags, language and collection; `nextCursor` continues the search |
| `read_snippet` | One owned, live snippet by ID/slug, including paths, code and source metadata |
| `fetch_collection` | A page of numbered recipe steps, each with its instruction and full snippet, in the owner's step order |
| `update_collection_steps` | Sets a collection's step order and per-step instructions; requires write scope |
| `create_snippet` | A new private snippet unless visibility is explicitly set; requires write scope |
| `update_snippet` | Replaces title and all files; requires write scope and is marked destructive |

Only the token owner's snippets are available, including private snippets. Other accounts' items,
shared-with-you items, trash and expired pastes are excluded. The server does not execute code,
restore files, expose env secrets or accept browser session cookies.

## Remote HTTP

The endpoint is `https://app.sniptide.com/api/mcp`, or `<your-instance-url>/api/mcp`. It ships with the
app; there is no separate service or port to deploy. Configure a bearer token explicitly; this
version has no OAuth login or discovery. JSON responses use stateless Streamable HTTP, with no
session ID, standalone SSE stream, or session deletion. Every request is authenticated again, so
revocation takes effect immediately. Origin headers, if present, must match the app's origin.

For [Claude Code](https://code.claude.com/docs/en/mcp), put this in a project `.mcp.json` and export
`SNIPTIDE_TOKEN` before starting Claude. Its configuration expands `${SNIPTIDE_TOKEN}`:

```json
{
  "mcpServers": {
    "sniptide": {
      "type": "http",
      "url": "https://app.sniptide.com/api/mcp",
      "headers": { "Authorization": "Bearer ${SNIPTIDE_TOKEN}" }
    }
  }
}
```

For [Cursor](https://cursor.com/docs/mcp), put this in your private `~/.cursor/mcp.json` (or an
untracked project `.cursor/mcp.json`), replacing the token placeholder:

```json
{
  "mcpServers": {
    "sniptide": {
      "url": "https://app.sniptide.com/api/mcp",
      "headers": { "Authorization": "Bearer YOUR_PERSONAL_API_TOKEN" }
    }
  }
}
```

Keep real tokens out of source control. Use your self-hosted app URL in either configuration.

## Local stdio

Build from the repository with Bun; the resulting executable runs with Node.js 24+:

```sh
bun install
bun --filter @sniptide/mcp build
```

This private workspace package is not published to npm. Use the absolute path of your checkout.
It only reads `SNIPTIDE_TOKEN` and `SNIPTIDE_BASE_URL`; it does not read the CLI's saved credentials.
The hosted URL is the default. HTTPS is required except on localhost, and redirects are refused.
Deployment path prefixes are supported.

Claude Code `.mcp.json`:

```json
{
  "mcpServers": {
    "sniptide": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/sniptide/packages/mcp/dist/sniptide-mcp.js"],
      "env": {
        "SNIPTIDE_TOKEN": "${SNIPTIDE_TOKEN}",
        "SNIPTIDE_BASE_URL": "https://app.sniptide.com"
      }
    }
  }
}
```

Cursor uses the same `command`, `args` and `env` fields. Omit `type` and replace the token expression
with your personal token in private configuration. For development, `bun run mcp` starts the source.
Stdout contains only MCP messages; startup failures go to stderr.

## Reuse a pattern

After enabling Sniptide in the client's MCP settings, ask:

> Search my Sniptide snippets for a TypeScript button tagged react, read the best match, and adapt
> it to this project's conventions. Fetch my ui collection and use its steps in order.

The agent should search summaries before requesting code. A collection page contains up to 50
snippets; pass its `nextCursor` and `nextStep` as `cursor` and `startStep` to continue. Steps follow
the order the owner set, then unplaced snippets oldest first, matching the token API and CLI.

To save a pattern, provide a title and the complete `files` list, optionally tags, source metadata
and an existing collection slug. Create defaults to private. Before editing, read the snippet and
include every file to keep. Update preserves omitted description, visibility, collection, tags
and source. Explicit null clears collection/source; `[]` clears tags. Link, expiry, password and
burn-after-read settings cannot be changed through this tool. Each edit adds the app's existing
history marker; content versioning/restoration is tracked separately in WRK-138/139.

Snippet content is user-provided data. Tool descriptions and server instructions tell clients to
interpret it as code, not as instructions from the MCP server. Writes carry explicit annotations;
the client controls user approval. Creates and edits are never retried automatically.

## Limits and errors

Requests share the token API's 3,600-per-hour limit, create rate limit, paste validation and account
storage budget. Remote MCP bodies are capped at 8 MiB. Local API calls time out after 30 seconds and
responses are capped at 25 MiB. Tool results share this cap in both transports; fetch individual
snippets if a collection page is too large. Each tool returns JSON as text and structured content, or an
`isError` result with a safe message. Local failures never echo upstream error bodies or tokens.

401 means the token is missing, expired, invalid or revoked; 403 means missing scope or an
unapproved browser origin; 429 means wait before retrying. Authenticated GET/DELETE return 405
because the server is stateless. Connect with Streamable HTTP, not legacy SSE.

## Verification

```sh
bun run test:mcp
TEST_DATABASE_URL=postgres://sniptide:sniptide@localhost:5432/sniptide_test bun --filter web test
```

The package tests use the official SDK client over in-memory and HTTP transports. The database
suite `apps/web/test/mcp.test.ts` connects via real HTTP and the built Node stdio process, creates a
pattern, finds and reads it, fetches a recipe and edits it. It also covers ownership, scopes,
revocation, expiry, pagination, protection preservation and rate limits. The database must end in
`_test`; the suite clears it. CI runs both suites. Client configuration examples follow the linked
Claude Code and Cursor documentation; acceptance in those desktop/editor clients should be checked
with your own token after deploying the PR.
