# Proposed CLI API contract (WRK-115)

**This is a client contract proposal, not an API currently served by Sniptide.** The implementation in
`src/contract.ts` and the CLI integration tests use this shape. The public API and token backend must
be implemented before the remote CLI can be shipped or WRK-115 can meet its hosted round-trip
acceptance criterion. Do not describe these routes as available in the app's OpenAPI document until
route handlers exist.

## Prerequisites and remaining server work

- WRK-106: account-owned, hashed personal tokens with `read` and `write` scopes, revocation,
  last-used timestamps and token management in settings. Every route below authenticates the
  bearer token; session cookies are not used by the CLI.
- Add versioned paste/list/collection handlers. Reuse existing account limits, validation,
  account storage budgets and collection ownership checks; filter deleted and expired pastes.
  `read` tokens must not authorize POST, and private code must remain account-scoped.
- Persist source metadata, selected line ranges and tags. The current paste schema has no fields
  for these. Paths can be stored in ordered `paste_file.name`, subject to its 120-character limit.
- Define a stable collection order and cursor; the current collection grouping alone does not
  define a reusable-code import order. Return all file content in collection pages.
- Document and test the real handlers in the app's OpenAPI reference, then run the actual CLI
  against the app and database. The current localhost suite checks client behavior only.
- WRK-111: secret-group APIs and `env` subcommands, under this same executable.

All URLs append `/api/v1` to the instance's configured URL, including a deployment path prefix.
Requests use `Authorization: Bearer TOKEN` and `Accept: application/json`. POST also uses
`Content-Type: application/json`. Responses should use `Cache-Control: private, no-store`.

## Capture and paste shape

```json
{
  "title": "Button",
  "description": "Reusable button and hook",
  "visibility": "private",
  "collection": "ui",
  "tags": ["react", "component"],
  "source": {
    "repository": "https://github.com/example/project.git",
    "commit": "0123456789012345678901234567890123456789",
    "dirty": false
  },
  "files": [
    {
      "name": "src/components/Button.tsx",
      "language": "typescript",
      "content": "export const Button = () => <button>Go</button>\n",
      "lines": { "start": 10, "end": 10 }
    }
  ]
}
```

`collection` is a slug or null. `source` is null outside Git; within Git, repository may be null if
there is no network origin. `lines` is omitted for whole files. All line numbers are 1-based,
inclusive. `dirty` distinguishes current code from the recorded HEAD commit. A returned paste has
these fields plus nonempty `id` and `slug` strings. File names are root-relative portable paths and
file order is preserved.

Client limits: title 1–120 characters, description at most 280 characters, up to 20 tags of 1–50
characters, 1–10 files, path length at most 120 characters, and 1 MiB content per capture. The server
must validate independently and enforce its own configured limits; clients cannot bypass budgets.

## Endpoints

| Operation | Method and path | Scope | Success body |
| --- | --- | --- | --- |
| Validate login | `GET /me` | Any valid personal token | `{"user":{"id":"user-id"},"scopes":["read","write"]}` |
| Create capture | `POST /pastes` | write | `{"paste": Paste}` (201 or 200) |
| Read capture | `GET /pastes/{id}` | read | `{"paste": Paste}` |
| List/search captures | `GET /pastes` | read | `{"pastes": [Summary], "nextCursor": string or null}` |
| Read ordered collection | `GET /collections/{slug}/pastes` | read | `{"pastes": [Paste], "nextCursor": string or null}` |

POST `/pastes` takes the Capture shape as its body. The collection must exist and belong to the
account. No collection is created implicitly. Creation should be transactional across the paste,
files, metadata and tags. CLI does not retry POST automatically.

GET `/pastes` accepts `q` (title/name search), repeated `tag`, `language`, `collection`, `limit` (1–100)
and opaque `cursor`. Tags should combine as AND filters; all filters compose with `q`. Summary
requires `id` and `title`; additional summary metadata passes through the CLI's JSON output unchanged
and can include `slug`, `languages`, `tags`, `collection` and timestamps. List/search returns one page
per command.

Collection pages must preserve a stable server-defined order across cursors, return full pastes,
and end with explicit `nextCursor: null`. CLI exhausts pages before writing. A repeated cursor,
malformed paste, duplicate output path, path collision or conflicting file prevents all writes.
The client caps a collection at 1,000 pastes and 20 MiB total content.

Failures use appropriate HTTP statuses: `400` invalid input, `401` invalid/revoked token, `403`
insufficient scope, `404` resource absent/inaccessible, `413` body too large, `429` rate limited
(optionally `Retry-After` as integer seconds), and `5xx` service failures. CLI deliberately does not
print error bodies, because they can accidentally echo tokens or captured content. No redirects are
followed; users must configure the final instance URL.

## Offline bundle

Offline transfers use `{ "version": 1, "pastes": [Capture] }`. They need no token or network. This is
an export/import format, not a local substitute for the Sniptide account database. A bundle may
contain multiple ordered captures; the CLI currently exports one per push and imports all entries.
Unknown versions, missing fields and malformed files fail before restoration.
