# Sniptide MCP server

Let a coding agent search, read and save your Sniptide snippets and apply a collection as ordered
steps. The server offers nine tools and three prompts to Claude Code, Codex, Cursor and any other
MCP client, on Sniptide Cloud and on self-hosted instances.

It runs in two ways with the same tools:

| Transport | Where it runs | Sign-in | Use it when |
| --- | --- | --- | --- |
| Remote HTTP | Inside the app at `/api/mcp` | OAuth in the browser, or an API token | Your client supports remote servers. Nothing extra to install. |
| Local stdio | `npx @sniptide/mcp` on your machine | An API token | Your client only supports stdio servers. |

## Connect a client

Add the remote server. On a self-hosted instance, replace `https://app.sniptide.com` with your
instance's address.

```sh
claude mcp add --transport http sniptide https://app.sniptide.com/api/mcp
```

Codex uses `codex mcp add sniptide --url https://app.sniptide.com/api/mcp`. In Cursor, add a
remote server with the same URL and no headers. The client receives a `401`, finds the sign-in
through the app's OAuth metadata and opens Sniptide in your browser, where you allow access.
[OAuth for agents](https://docs.sniptide.com/oauth) explains the scopes and how to revoke a
connection.

To check the connection, ask the agent to list your Sniptide collections. It calls
`list_collections` and answers with your collections, or with an empty list on a new account.

### Use an API token instead

Use a personal API token when the client doesn't support OAuth or the agent runs unattended.
Create it in **Settings** > **API tokens**. A read-only token can only look things up, and
**Write access** also lets the agent save and edit snippets.

For Claude Code, put this in the project's `.mcp.json` and export `SNIPTIDE_TOKEN` before you start
it. Claude Code expands `${SNIPTIDE_TOKEN}` from the environment.

```json title=".mcp.json"
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

Cursor takes the same `url` and `headers` without `type`. Put that configuration in your private
`~/.cursor/mcp.json`, or in a project `.cursor/mcp.json` that Git ignores, with the token written
in place of the variable. Keep real tokens out of source control.

### Run the server locally

The local server needs Node.js 24 or newer and an API token. It calls the token API of the instance
in `SNIPTIDE_BASE_URL`, which defaults to `https://app.sniptide.com`.

```json title=".mcp.json"
{
  "mcpServers": {
    "sniptide": {
      "type": "stdio",
      "command": "npx",
      "args": ["--yes", "@sniptide/mcp"],
      "env": {
        "SNIPTIDE_TOKEN": "${SNIPTIDE_TOKEN}",
        "SNIPTIDE_BASE_URL": "https://app.sniptide.com"
      }
    }
  }
}
```

The local server reads only these two variables and takes no arguments. It doesn't use the CLI's
saved credentials. The base URL must use HTTPS, except on `localhost`, `127.0.0.1` and `[::1]`, and
can include a path prefix. Redirects are refused, so the token never leaves the instance you chose.
Standard output carries only MCP messages, and startup failures go to standard error.

## Tools

| Tool | What it does | Access |
| --- | --- | --- |
| `search_snippets` | Returns a page of summaries. `query` matches when every word appears in the title, description, tags, file paths or code. Filters by tags, language and collection. `nextCursor` continues the search. | read |
| `read_snippet` | Returns one snippet by id or link, with its file paths, code and source metadata. | read |
| `list_collections` | Lists your collections with their slugs, names and how many live snippets each holds. | read |
| `fetch_collection` | Returns a page of up to 50 snippets from a collection as numbered steps, oldest capture first. | read |
| `create_snippet` | Saves a new snippet. It is private unless `visibility` is set. | write |
| `update_snippet` | Replaces a snippet's title and **all** its files. Marked destructive. | write |
| `update_snippet_settings` | Changes visibility, expiry, password or burn after read. Marked destructive. | write |
| `create_collection` | Creates an empty collection by name and returns its slug. | write |
| `trash_snippet` | Moves a snippet to the trash, where you can restore it in the app. Marked destructive. | write |

The agent reaches only the account owner's own live snippets, private ones included. It can't reach
other people's snippets, snippets shared with you, the trash or expired snippets. The server doesn't
run code, write files to your machine, expose env groups or accept browser session cookies.

A few rules decide what a write does:

- An update replaces every file, so the agent reads the snippet first and sends every file it wants
  to keep. Fields it leaves out keep their values. `null` clears the collection or source, and `[]`
  clears the tags. The previous version stays in the snippet's revisions.
- `update_snippet_settings` counts expiry from now. A password set this way appears in the
  conversation, and the tool never returns it.
- Creates and edits are never retried. The client decides whether to ask you before a write runs.

## Prompts

Claude Code and Cursor list the prompts in their slash menus. Each one starts a common job with the
tools in the right order.

| Prompt | Arguments | What it asks the agent to do |
| --- | --- | --- |
| `use_snippet` | `task` | Search your snippets for the task, read the best match and adapt it to the project. |
| `save_snippet` | `code`, optional `collection` | Propose a title, tags and paths, leave secrets out, and save a private snippet after you confirm. |
| `apply_collection` | `collection`, optional `goal` | Fetch every page of the collection, list its steps and wait for your go-ahead before applying them in order. |

The `collection` argument completes from your collection slugs.

Snippet content is data from whoever saved it. The server's instructions tell clients to read it as
code and to follow only your instructions. Give an agent write access only when it needs it, and
review what it saves.

## Limits and errors

MCP requests share the token's 3,600 requests an hour, the limit of 30 new pastes an hour, paste
validation and the account's storage limit. Remote request bodies are capped at 8 MiB, and every
tool result at 25 MiB, so read single snippets when a collection page is too large. The local
server's API calls time out after 30 seconds.

A tool returns JSON as text and as structured content. A failed tool call returns an `isError`
result with a short message, which never contains the token or the server's error body.

| Response | Meaning | Action |
| --- | --- | --- |
| `401` | The token or connection is missing, expired, invalid or revoked. | Sign in again, or replace the token. |
| Tool error that names the write scope | The token or connection is read-only. | Connect again with `write`, or use a token with **Write access**. |
| `403` | The request came from a browser origin other than the app's. | Call the server from the agent, not from a web page. |
| `405` | A `GET` or `DELETE` reached the endpoint. The server is stateless and keeps no sessions. | Connect with Streamable HTTP, not the older SSE transport. |
| `429` | A rate limit was reached. | Wait for `Retry-After` before retrying. |

The [MCP documentation](https://docs.sniptide.com/mcp) covers the agent plugin, read counts and
more client setups.

## Develop the server

From the repository root, `bun run mcp` starts the stdio server from source. To build the Node.js
executable that npm ships:

```sh
bun install
bun --filter @sniptide/mcp build
node packages/mcp/dist/sniptide-mcp.js
```

To use a local build in a client, put `node` and the absolute path to
`packages/mcp/dist/sniptide-mcp.js` in place of `npx` and its arguments.

Run the tests:

```sh
bun run test:mcp
TEST_DATABASE_URL=postgres://sniptide:sniptide@localhost:5432/sniptide_test bun --filter web test
```

`test:mcp` drives the server with the official SDK client over in-memory and HTTP transports.
The web suite in `apps/web/test/mcp.test.ts` connects over real HTTP and through the built stdio
process, and checks ownership, scopes, revocation, expiry, pagination and rate limits. It clears
its database, so the database name must end in `_test`. CI runs both suites.

## License

[MIT](LICENSE).
