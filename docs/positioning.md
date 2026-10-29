# Sniptide positioning and messaging

The source of truth for how we describe Sniptide. Landing, README, docs and launch posts take their
words from here ([landing copy](landing-copy.md) is the first use). If the product changes, change
this page first. Every claim below is something the app, CLI or MCP server does today.

## Pitch

**Sniptide is the self-hostable pastebin for snippets, configs and secrets, and a library of clean
patterns your AI agents can reuse.**

Short form: *Paste it. Share it. Let your agents reuse it.*

## Who it's for

| Audience | What they want | What they get |
| --- | --- | --- |
| **Developers** who paste code, logs and configs into chat all day | A fast, private link that isn't a public wall of text | Paste in seconds, share with a link, a password or a one-time view |
| **Teams and homelabbers** who keep data on their own servers | A paste tool they run themselves | One Docker image plus Postgres, AGPL-3.0, your data in your database |
| **People working with coding agents** (Claude Code, Cursor) | Agents that reuse their patterns instead of inventing new ones | Search, read and save snippets over MCP or the CLI |

Primary: the developer who already uses an AI coding agent and has a small pile of snippets,
`.env` files and recipes they keep re-explaining. Not for: teams that need a full secrets manager
with rotation, audit trails and per-environment RBAC.

## Pillars

1. **Paste and share.** Capture code or a whole folder, keep file paths, get a short link. Choose
   private, unlisted or public; add a password, an expiry or burn-after-read. Links unfurl in
   Slack, Discord and social cards, and the editor auto-saves, undoes and rolls back.
2. **Agents.** Your best snippets become a pattern library. A coding agent searches summaries,
   reads the match and follows a collection's steps in order through the MCP server, and the CLI
   does the same from a terminal. Writes need an explicit token scope, and snippets an agent
   creates are private.
3. **Secrets.** Sync `.env` files as env groups that are encrypted at rest, pulled with
   `sniptide env pull` or injected with `sniptide env run`, and never printed in tool output. The
   editor warns when you paste something that looks like a key. Secret-friendly paste links (password,
   one-time) cover the one-off handoff.

## Differentiators

| vs | Where Sniptide differs |
| --- | --- |
| **GitHub Gist** | A gist lives on GitHub; Sniptide lives on your server. Adds password, expiry and burn-after-read links, ordered collections of recipes, `.env` sync, and agent access over MCP and the CLI. |
| **Pastebin** | A hosted public service; Sniptide is open source and yours to run. Accounts, multi-file pastes, revisions and undo, and the same agent and secrets tooling. |
| **Infisical** | Not a replacement. Infisical is a full secrets platform; Sniptide is the lighter option when you need a project's `.env` synced and a place for snippets and configs in the same tool. We say this plainly. |

The differentiator is the combination: paste, a reusable pattern library for agents and `.env`
sync in one self-hostable app. No single feature is the pitch.

Competitor facts change. Before publishing a claim about one of them, check their current docs,
and keep the comparison to what we can verify.

## Tone

- **Plain and quick.** Short sentences, concrete verbs, no filler. Say what happens.
- **Developer to developer.** Show the command or the result before the adjective.
- **Calm about security.** State what is encrypted, what is private and what isn't. No fear
  marketing, no "military-grade".
- **Honest about scope.** Name what Sniptide does not do (no key rotation, no OpenID Connect or agent identity assertions).
- **Delightful in small ways.** A little warmth is welcome; jokes in the empty states, never in
  errors or security copy.

Avoid: "revolutionary", "seamless", "supercharge", "AI-powered" (we expose data to agents; we
don't add AI to your paste), comparisons that run down competitors.

Use: *paste, snippet, pattern, link, self-host, agent*. Write "Sniptide" in sentence case, never
"SnipTide".

## Proof points we can use

- `docker compose up -d` gets a running instance.
- AGPL-3.0 licensed.
- Official image at `ghcr.io/dino-kupinic/sniptide` for AMD64 and ARM64.
- Nine MCP tools: search, read, fetch collection, create, update, list and create collections, change sharing settings and move a snippet to the trash.
- CLI works offline for bundle export and import.
