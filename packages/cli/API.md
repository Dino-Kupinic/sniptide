# CLI API (WRK-115, WRK-111)

The CLI talks to the token API under `/api/v1`, served by `apps/web/app/api/v1`. The full reference,
with request and response schemas and examples, is the app's OpenAPI document (`/docs/api` on any
instance, written in `apps/web/lib/openapi.ts`). This page summarizes the contract the CLI relies on.

## Authentication

Every request sends `Authorization: Bearer snpt_…`, a personal API token created in Settings → API
tokens. Tokens are stored as SHA-256 hashes, can expire, record when they were last used, and are
revoked by deleting them in Settings. Scopes: `read` (every token) lists and pulls pastes and env
groups; `write` also creates pastes and pushes or deletes env groups. Session cookies are not used.

URLs append `/api/v1` to the instance's configured URL, including a deployment path prefix.
Responses carry `Cache-Control: private, no-store`. Errors are `{ "ok": false, "error": "…" }` with
`400` invalid input, `401` missing/invalid/expired/revoked token, `403` missing scope, `404` absent
or not the token owner's, `409` env group limit, `413` size or storage limit, and `429` rate limited
(with `Retry-After`). The CLI prints none of these bodies.

## Endpoints

| Operation | Method and path | Scope | Success body |
| --- | --- | --- | --- |
| Check token | `GET /me` | read | `{"user":{"id","name","username"},"scopes":["read","write"]}` |
| Create capture | `POST /pastes` | write | `201 {"paste": Paste}` |
| Update capture | `PUT /pastes/{id or slug}` | write | `{"paste": Paste}` (title/files replaced; omitted metadata preserved) |
| Read capture | `GET /pastes/{id or slug}` | read | `{"paste": Paste}` |
| List/search | `GET /pastes?q&tag&language&collection&limit&cursor` | read | `{"pastes": [Summary], "nextCursor": string or null}` |
| Ordered collection | `GET /collections/{slug}/pastes?cursor` | read | `{"pastes": [Paste], "nextCursor": string or null}` |
| List env groups | `GET /env` | read | `{"groups": [{"slug","variables","createdAt","updatedAt"}]}` |
| Read env group | `GET /env/{group}` | read | `{"group": {"slug","updatedAt","variables":[{"name","value"}]}}` |
| Replace env group | `PUT /env/{group}` with `{"variables": [...]}` | write | `{"group": …}` |
| Delete env group | `DELETE /env/{group}` | write | `{"ok": true}` |

A capture is `{ title, description, visibility, collection, tags, source, files }` where each file is
`{ name, content, lines? }` and `name` is a root-relative path (at most 120 characters). The server
detects each file's language from its name, stores tags lowercase, and keeps `source` (repository,
commit, dirty) and `lines` (1-based, inclusive) as metadata. Pastes are private unless
`visibility` says otherwise and never expire. A `collection` must already exist; none is created
implicitly. Creation is one transaction under the account's paste, storage and hourly create
limits, the same ones the editor applies. A returned `Paste` adds `id`, `slug`, `url`, `createdAt`,
`updatedAt` and `expiresAt`.

Lists and collections only include the token owner's live pastes (not trashed, not expired). Lists
are ordered by last edit, collections by creation, both with the id breaking ties; cursors are
opaque and stable across pages, and the last page has `nextCursor: null`. Collection pages hold 50
full pastes; the CLI reads every page before writing, and stops at 1,000 pastes or 20 MiB.

Env groups are named 1–64 lowercase letters, digits, `.`, `-` and `_`, hold up to 500 variables
(32 KB per value, 256 KB per group), and an account has up to 100. `PUT` replaces the whole group in
the order given, creating it if it's new. Values are encrypted with AES-256-GCM before they are
stored, bound to their group and name.

## Offline bundle

Offline transfers use `{ "version": 1, "pastes": [Capture] }`. They need no token or network. A
bundle may contain multiple ordered captures; the CLI exports one per push and imports all entries.
Unknown versions, missing fields and malformed files fail before restoration.
