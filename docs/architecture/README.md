# Sniptide architecture diagrams

The HTML files are the editable, self-contained sources. PNGs are browser screenshots of their
`.canvas` elements at 2× resolution. Each source embeds its logos and fonts and works offline.

- [Open-source installation](open-source.html): the bundled Docker Compose topology with the
  optional Caddy proxy enabled. The light and dark PNGs live in
  `apps/docs/public/images/architecture/` and appear in the self-hosting guide.
- [Hosted application](hosted.html): Cloudflare, the separate marketing, app, documentation and
  demo services, and the Coolify build workflow. [Light PNG](hosted.png),
  [dark PNG](hosted-dark.png).

## Evidence and scope

Reviewed on 5 November 2026, against `sniptide` main commit `b93ad88` and the local
`sniptide-web` commit `ae732e4`. Maintain the diagrams when these sources change:

| Area | Source |
| --- | --- |
| Compose services, proxy and persistent volume | `docker-compose.yml` |
| App runtime and packaged tools | `Dockerfile`, `apps/web/package.json` |
| Database connection and ORM | `packages/db/src/index.ts` |
| Browser authentication | `packages/auth/src/index.ts`, `apps/web/lib/auth.ts` |
| Agent OAuth | `apps/web/app/api/oauth/`, `apps/web/lib/oauth/grants.ts` |
| Migrations and in-process background jobs | `apps/web/instrumentation-node.ts`, `apps/web/lib/jobs.ts` |
| Remote and local MCP transports | `packages/mcp/README.md` |
| Optional integrations | `apps/web/.env.example` |
| Coolify deployments and docs service | `.github/workflows/ci.yml`, `apps/docs/Dockerfile` |
| Marketing/share proxy, domains and demo isolation | `sniptide-web/README.md`, `sniptide-web/lib/share-proxy.ts`, `sniptide-web/lib/site.ts` |
| Hosting provider | `sniptide-web/lib/legal.ts` (`netcup GmbH`, Germany) |

Live HTTPS response headers on `sniptide.com`, `app.sniptide.com` and `docs.sniptide.com`
reported `server: cloudflare`. The hosted diagram describes the logical topology supported by
those headers and repository configuration. It is not an inventory of live hosts or replicas:
Coolify's live configuration, database placement and production integration settings were not
inspected. The demo database is shown as a logical data boundary; its live database configuration
and isolation from production were not verified.

The open-source diagram represents the bundled Compose installation, not a required hosting
provider. Other installations can supply their own Postgres and HTTPS proxy. The database volume
is persistent storage, not a backup. Optional integrations are called out in prose rather than
shown as services that every installation runs.

## Edit and render

Edit the groups, node labels and SVG edge paths in the HTML source. Keep the canvas dimensions
and SVG viewBox aligned. Brand marks must retain their original colors. The source footer credits
svgl, Lucide, Caddy and Coolify; logos remain the trademarks of their owners. Embedded Geist and
JetBrains Mono fonts are covered by the accompanying SIL Open Font Licenses.

With the `stack-diagram` skill and Python Playwright installed, render both themes:

```sh
python3 <stack-diagram-skill>/scripts/render_png.py \
  docs/architecture/open-source.html \
  apps/docs/public/images/architecture/open-source.png --selector .canvas --scale 2
python3 <stack-diagram-skill>/scripts/render_png.py \
  docs/architecture/hosted.html docs/architecture/hosted.png --selector .canvas --scale 2
```

The renderer writes the light PNG and a sibling `-dark.png`. Inspect all four images after an
edit: text must fit, group labels must remain visible, and arrows must avoid node labels. Run
`bun run test:docs` and `bun run verify` after updating the documentation. No loose logo downloads
or temporary browser dependencies are needed in the repository.
