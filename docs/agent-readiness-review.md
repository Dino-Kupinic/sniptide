# Agent-readiness review

This records the October 28, 2026 orank brief against the delivered code. Changes need to merge
and deploy before a production rescan can measure them. The cached production score read during
this work was **80/100, B**. This document does not predict a new score.

## Delivered changes

| Scan finding | Implementation or verified existing behavior |
| --- | --- |
| ARD discovery | Marketing publishes `/.well-known/ard.json` with actual API, product MCP, documentation MCP, and skill targets. |
| MCP registry presence | Official `io.github.Dino-Kupinic/sniptide` version 0.2.0 was active in the MCP registry on October 28. Marketing docs link back to it. |
| CLI availability | `@sniptide/cli` version 0.2.0 already exists on npm. Marketing's stale unpublished claim is corrected. |
| Agent plugin manifest | Marketing repository includes portable `plugin.json`, a documentation MCP configuration, and three capability skills. |
| Agent skills index | Marketing serves `/.well-known/agent-skills/index.json` and the actual `SKILL.md` files. |
| Agent mode | Known marketing pages support `?mode=agent`; the homepage representation includes endpoints, scopes, and authentication links. |
| Markdown URLs and alternates | Homepage, developer docs, authentication, MCP, About, and Contact have Markdown representations and canonical metadata. HTTP Link advertises existing alternates. |
| Markdown content negotiation | Known marketing pages serve Markdown for an explicit accepted preference, with `Vary: Accept`. Ordinary HTML and signed-in browser navigation remain available. |
| Markdown frontmatter | Served authored documents include title, description, and canonical URL frontmatter. |
| Extended structured data | SoftwareApplication and Offer were already present. Published operator contact and postal address are now included. |
| API catalog | Marketing and app publish RFC 9727 Linksets with API endpoint and service-description links, including HEAD discovery. |
| Schema feeds | Marketing publishes a public JSONL schema feed and XML schema map advertised in robots.txt. No user paste inventory is exported. |
| HTTP Link headers | Marketing page responses link sitemap, Markdown alternate, OpenAPI, ARD, and API catalog. |
| Modular llms.txt | `/docs/llms.txt` provides a focused index linked from root agent documentation. |
| Sitemap lastmod | Marketing sitemap entries carry curated dates from actual content changes. |
| Trust pages | About and Contact publish factual operator/product/support information. Privacy and Impressum already exist. |
| Scoped permissions | Personal tokens already enforce read/write scopes. OpenAPI already declares these through `x-required-scopes`; they are not OAuth grants. |
| Idempotent creates | Optional `Idempotency-Key` on paste and collection POSTs stores response and mutation in one transaction for 24 hours. Conflicting reuse returns 409. Authentication and quotas apply before replay. |
| Rate-limit headers | Token REST and product MCP responses expose named quotas from atomic Postgres counters. 429 Retry-After uses the actual remaining window. |
| Product and docs MCP | Product MCP remains authenticated. A separate public documentation MCP searches/reads only published guides. An authenticated connected product MCP read succeeded during verification. |
| Sandbox guidance | Documentation describes a separate local self-hosted instance and database with disposable data. The shared public demo is explicitly not private or isolated. |
| REST batch endpoint | `/api/v1/batch` accepts up to 20 typed creates, ordered independent transactions, required per-item keys, and explicit partial results. |
| Onboarding | Existing self-service personal tokens remain the supported method. Source docs describe scope selection, errors, rotation, and revocation. |
| Version/deprecation policy | API reliability docs define v1 compatibility and hosted deprecation notice policy. |
| NLWeb ask and streaming | Marketing implements bounded public documentation keyword search using NLWeb v0.55 JSON and SSE start/result/error/complete envelopes. It does not generate answers with an LLM. |
| Agent-friendly 404 | App share routes negotiate private, uncached Markdown 404s while preserving existing private, password, burn, expiry, and raw-access checks. Marketing continues forwarding unknown share paths. |
| Multi-language SDK source | Separate WRK-400 PR adds standalone TypeScript and Python clients, source installation and registry release instructions, HTTP contract tests, and package checks. |

## Remaining gaps and prerequisites

| Item | What remains |
| --- | --- |
| OAuth, protected-resource metadata, PKCE, CIMD, OAuth WWW-Authenticate hints | A real delegated authorization server and consent/token/revocation flows are not implemented. Personal bearer tokens remain supported. Track WRK-401. Publishing metadata alone would advertise nonexistent flows. |
| WorkOS auth.md discovery/register/claim/exchange and agent_auth endpoints | These depend on the missing authorization server and a provider trust configuration. Current auth.md documents the actual personal-token method. Track WRK-401. |
| A2A agent card | There is no A2A agent service. An MCP server or docs search endpoint is not an A2A agent. No card is fabricated. |
| Web Bot Auth signing directory | No operational Ed25519 signing identity, key lifecycle, or request signature verification is configured. No placeholder JWK is published. |
| Wikipedia/Wikidata | Independent coverage and notability evidence are needed before drafting or submitting an entity/article. No entity or citation is invented. |
| ChatGPT directory | Requires publisher identity verification, submission access, listing/review materials, test credentials where applicable, and external approval. Source plugin preparation does not create an approved listing. Track WRK-402. |
| npm/PyPI SDK releases | Source clients are prepared, not published. Package ownership and registry publishing/trusted-publisher setup must be verified after merge. Existing CLI/MCP publication does not constitute a general SDK. Track WRK-402. |
| skills.sh listing and quality evaluation | Three source skills are prepared. They must merge, be installed through the skills CLI, and be indexed externally before claiming a listing. Track WRK-402. |
| Additional sameAs profiles | Only the verified project GitHub link is used. No Wikipedia, Wikidata, LinkedIn, or social profile is invented. |
| Complete Markdown twins | Legal pages and the `/home` alias still have HTML only. Authored main/developer/trust pages have Markdown; universal page coverage is not claimed. |
| Bot User-Agent Markdown bonus | Automatic UA-only Markdown is not enabled. Explicit Accept negotiation and agent mode are supported. |
| Hosted isolated API sandbox | Local isolated self-hosting is documented; no new hosted sandbox is provisioned. The public shared demo must not receive private data. |
| Async jobs | Existing 202 is an MCP notification acknowledgement. The API has no long-running job to poll, so no fake jobs endpoint is added. |
| All-mutation idempotency | Only supported create routes accept the header. PUT, PATCH, DELETE and MCP tools do not gain automatic retry guarantees. |
| HTML Vary | Next.js replaces rendered HTML Vary values. HTML uses private, no-store; negotiated Markdown includes Vary: Accept. Shared cache behavior should be checked at the production edge. |
| Production rescan | Run only after merge/deployment. Scanning unmerged changes would remeasure the old public site. Track WRK-402. |

## Evidence and follow-ups

- [WRK-399](https://linear.app/dkupinic/issue/WRK-399/close-remaining-orank-agent-readiness-gaps) tracks this delivery.
- [WRK-400](https://linear.app/dkupinic/issue/WRK-400/add-official-typescript-and-python-api-clients) tracks SDK source delivery.
- [WRK-401](https://linear.app/dkupinic/issue/WRK-401/implement-delegated-oauth-authorization-for-agent-clients) tracks delegated authentication.
- [WRK-402](https://linear.app/dkupinic/issue/WRK-402/complete-external-agent-directory-and-sdk-publication-steps) tracks external publication and post-deployment verification.
- [Official MCP registry record](https://registry.modelcontextprotocol.io/v0.1/servers/io.github.Dino-Kupinic%2Fsniptide/versions/latest).
- [Published CLI package](https://www.npmjs.com/package/@sniptide/cli) and [published MCP package](https://www.npmjs.com/package/@sniptide/mcp).
- [Cached production score](https://ora.ai/score/sniptide.com).
- [ChatGPT plugin submission requirements](https://developers.openai.com/plugins/deploy/submission).
