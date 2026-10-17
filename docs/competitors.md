# Competitor feature matrix

How Sniptide compares with the tools people use today to share snippets and secrets. Built for
[WRK-99](https://linear.app/dkupinic/issue/WRK-99/build-a-feature-comparison-matrix-vs-competitors).

- **Researched:** 2026-10-16, from the public pages linked in [Sources](#sources). Vendor pages
  change; re-check a row before quoting it externally.
- **Sniptide column:** read from this repository at the commit this file was added in (paths in
  [Sniptide evidence](#sniptide-evidence)), not from marketing copy.
- **"Not documented"** means the pages we checked don't say. It is not a claim that the feature is
  missing.

## Code and text sharing

| | **Sniptide** | **Pastebin** | **GitHub Gist** | **PrivateBin** | **Hastebin (haste-server)** |
| --- | --- | --- | --- | --- | --- |
| Self-hosting | Yes. Docker image (amd64/arm64), Compose file, Coolify template; Postgres | Not documented (hosted service) | Not documented for github.com | Yes. PHP; files or a database | Yes. Node.js; Redis or filesystem storage |
| Open source | AGPL-3.0 | Not documented | Not documented | Yes, zlib/libpng | Yes, MIT (per npm package page) |
| Accounts | Email/password, optional GitHub and Google; sign-up can be closed or limited to an invite list | Yes | GitHub accounts | No accounts | No accounts |
| Collections / organization | Collections, tags, search, stars, trash, per-paste revisions | Folders (accounts only) | Starring; each gist is a git repo | None documented | None documented |
| Visibility | Public, unlisted, private | Public, unlisted, private | Public and secret (secret gists are unlisted, **not private**) | Link-only; the key lives in the URL fragment | Link-only |
| Sharing | Share with specific people with view or edit access; Slack and Discord share; link previews | Link | Link; fork and clone | Link | Link |
| Expiry | 1 hour, 1 day, 1 week, 1 month, never | 10 minutes up to 1 year, or never | Not documented | Configurable by the admin, including never | Not documented |
| Burn after reading | Yes | Not documented | Not documented | Yes | Not documented |
| Password protection | Yes (scrypt hash) | Not documented | Not documented | Yes | Not documented |
| Encryption | Passwords hashed; HTTPS in transit. Paste content is stored as plain text in Postgres, so the operator can read it. Not zero-knowledge | Not documented | Not documented | Client-side AES-256-GCM, key in the URL fragment; the server cannot read pastes | Not documented |
| Version history | Revisions with rollback | Not documented | Full git history | Not documented | Not documented |
| API | Token API under `/api/v1`, OpenAPI document and Scalar docs at `/docs/api` | HTTP API; needs a developer key; login key for private pastes | REST API (`gist` OAuth scope) | The FAQ says plain `curl` does not work because encryption happens client-side; community CLI clients exist | Not documented |
| CLI | `sniptide` captures files, folders and globs, restores paths, syncs `.env` files (not on npm yet) | Not documented | Not documented | Community clients only | Community clients only |
| Agent / MCP support | Built-in MCP endpoint (`/api/mcp`) plus a local stdio server: search, read, fetch collection, create, update | No first-party MCP found | No first-party MCP server found; community servers exist (GistPad) | No | No |
| Analytics | Views, uniques, copies, raw reads, referrers, devices, countries; no cookies, stored in your own database | View counts | Not documented | No | No |
| Pricing | Free in early access; no paid plan yet | Free with ads. Pro removes ads and raises limits (paid; the Pro page said "sold out" when we fetched it) | Free | Free (self-hosted) | Free (self-hosted) |
| Size limits | 1 MiB and 10 files per paste; 1 GiB and 10,000 pastes per account (defaults) | Free: 500 KB per paste, 10 private and 10 unlisted pastes, 20 new pastes per day. Pro: 10 MB | API returns 1 MB per file; clone for larger | Admin-configured | Admin-configured |

## Secrets and environment variables

Sniptide's env groups are a small feature next to a secrets manager. This table is here to show
where the overlap ends.

| | **Sniptide** | **Infisical** | **Doppler** |
| --- | --- | --- | --- |
| What it is | `.env` sync (`sniptide env push/pull`) inside a snippet tool | Dedicated secrets manager | Dedicated secrets manager |
| Self-hosting | Yes (the whole app) | Yes. Core is MIT; supported self-hosting is a sales conversation | On-prem for Enterprise only (announced June 2026); otherwise SaaS |
| Open source | AGPL-3.0 | MIT core | No |
| Encryption | AES-256-GCM per value at rest, with a key derived from `ENV_SECRETS_KEY` or `BETTER_AUTH_SECRET`. The server holds the key | Not compared here | Not compared here |
| Environments / projects | One flat group per project, slug-based | Per-project environments (3 on Free, 6 on Pro, 12 on Advanced) | Projects and configs |
| Versioning / recovery | No history for env groups | Secret versioning and point-in-time recovery on Pro and up | Not listed on the pricing page |
| Access control, SSO, audit log | API tokens (read-only or write); no SSO or audit log for env groups | SAML on Pro; audit logs from Pro (30 days) | Audit log 3 days (Developer), 90 days (Team) |
| Agent / MCP | Env values are deliberately not exposed through MCP | Official MCP server (Apache-2.0): create, read, update, delete secrets, with a value-masking option | Experimental official MCP server (`@dopplerhq/mcp-server`) |
| Pricing | Free in early access | Free: 5 identities. Pro $20 per identity per month billed annually ($23 monthly); Advanced $40 ($46 monthly) | Developer: free for 3 users, then $8 per extra user per month. Team $21 per user per month |

## Where Sniptide wins

1. **One self-hostable tool for code, collections, CLI and agents.** No other tool in the first
   table combines self-hosting, accounts, collections, sharing with edit access, a token API and
   an MCP endpoint. PrivateBin and haste-server self-host but have no accounts or organization.
   Gist and Pastebin have accounts but cannot be self-hosted.
2. **Agent-ready.** A first-party MCP server with a hosted `/api/mcp` endpoint that also works on
   self-hosted instances. We found no first-party MCP server from Pastebin, Gist, PrivateBin or
   haste-server.
3. **Real private pastes.** A Gist "secret" is a link anyone can open, and Pastebin caps free
   accounts at 10 private pastes. Sniptide private pastes are owner-only and count only toward the account-wide limit (10,000 pastes by default).
4. **Sharing controls in one place.** Visibility, per-person view/edit access, password, burn after
   read and expiry on every paste, plus Slack and Discord delivery.
5. **Privacy-friendly analytics.** Views, uniques, referrers and countries without cookies or an
   outside service. Nothing is sent anywhere on self-hosted instances.
6. **Free and permissively priced today.** No ads and no per-paste caps like Pastebin's free tier.
   (This is an early-access position, not a commitment.)

## Gaps

1. **No zero-knowledge option.** PrivateBin encrypts in the browser and the server never sees the
   content. Sniptide stores paste content in plain text; its protection is access control, not
   cryptography. This is the strongest argument against us for people sharing sensitive text.
2. **No git semantics.** Gist is a git repository (clone, fork, diff, history). Sniptide has
   revisions, but no fork or git remote.
3. **Env groups are not a secrets manager.** No history or rollback, no audit log, no SSO, no
   per-environment structure, and the encryption key sits on the same server. Infisical and
   Doppler cover all of that. Position env sync as a convenience, not a replacement.
4. **Distribution.** The CLI and MCP package are not published to npm yet, so setup is "clone and
   build". Gist, Infisical and Doppler ship installable clients.
5. **MCP auth is bearer-token only.** No OAuth login or discovery yet.
6. **Reach.** Gist is where developers already are, with discovery, comments and embeds. Pastebin
   has years of search traffic. Sniptide has neither network effect yet.
7. **Expiry granularity.** Pastebin offers 10 minutes, 2 weeks, 6 months and 1 year; Sniptide's
   shortest expiry is 1 hour and its longest finite one is 1 month.

## Sniptide evidence

| Claim | Where |
| --- | --- |
| AGPL-3.0 | `LICENSE` |
| Docker, Compose, Coolify, sign-up and invite settings | `README.md` (Self-hosting, Settings) |
| Visibility, password hash, burn after read, tags, collection, expiry | `packages/db/src/schema/pastes.ts` |
| Expiry choices `1h`, `1d`, `1w`, `1m`, `never` | `apps/web/lib/pastes/types.ts` |
| View/edit access when sharing with a person | `apps/web/lib/pastes/types.ts` (`ACCESSES`) |
| Revisions with snapshots | `packages/db/src/schema/pastes.ts` (`pasteRevision`) |
| Collections | `packages/db/src/schema/collections.ts` |
| Env values encrypted with AES-256-GCM | `packages/db/src/schema/env.ts`, `apps/web/lib/env/crypto.ts` |
| Token API and OpenAPI | `README.md` (API reference), `apps/web/lib/openapi.ts` |
| MCP tools, bearer-token auth, not on npm | `packages/mcp/README.md` |
| CLI features, not on npm | `packages/cli/README.md` |
| Limits (1 MiB, 10 files, 1 GiB, 10,000 pastes) | `packages/cli/README.md`, `docs/scaling.md` |
| Free during early access | `apps/web/components/settings/settings-view.tsx` (Billing tab) |
| Analytics | `README.md` (Settings) |

## Sources

Pastebin
- API: <https://pastebin.com/doc_api>
- Pro and free limits: <https://pastebin.com/pro>

GitHub Gist
- Secret vs public, history, fork: <https://docs.github.com/en/get-started/writing-on-github/editing-and-sharing-content-with-gists/creating-gists>
- REST API and limits: <https://docs.github.com/en/rest/gists/gists>
- Community MCP server: <https://www.npmjs.com/package/gistpad-mcp>

PrivateBin
- Project README: <https://github.com/PrivateBin/PrivateBin>
- License: <https://raw.githubusercontent.com/PrivateBin/PrivateBin/master/LICENSE.md>
- FAQ: <https://github.com/PrivateBin/PrivateBin/wiki/FAQ>

Hastebin
- haste-server on npm (license, storage): <https://www.npmjs.org/package/haste-server>

Infisical
- Pricing: <https://infisical.com/pricing>
- Official MCP server: <https://github.com/Infisical/infisical-mcp-server>

Doppler
- Pricing: <https://www.doppler.com/pricing>
- MCP server: <https://docs.doppler.com/docs/mcp>
- On-prem: <https://www.doppler.com/doppler-on-prem>

## Confidence notes

- **Hastebin / haste-server:** the GitHub repository pages did not load for us, so this column
  rests on the npm package page and packaging repositories. Treat it as the weakest column.
- **Pastebin Pro price:** the Pro page showed no price and said Pro was sold out. Confirm before
  citing a number.
- **Pastebin API:** the page does not say whether free accounts can use the API beyond the limits
  it lists for them.
- **Doppler on-prem:** the announcement is recent and its feature set is not public. Older
  comparisons that call Doppler SaaS-only are out of date.
