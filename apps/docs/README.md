# Sniptide docs

The documentation site: Next.js with [Fumadocs](https://fumadocs.dev), served from the root of its
own domain (docs.sniptide.com). It is a separate workspace from the app (`apps/web`) so it deploys
and scales on its own; the app's API reference stays at `/docs/api` in the app and the docs nav
links to it.

```bash
bun run --filter docs dev     # http://localhost:3001
```

## Writing

Pages are MDX files in `content/docs`; a `meta.json` in a folder orders its pages. The first
heading comes from the `title` in the frontmatter, so start the body at `##`.

Every page can use these components without importing them. They are registered in
`components/mdx.tsx`, and the prose around them is styled in `app/global.css`.

| Component | Use it for |
| --- | --- |
| `<Steps>` and `<Step>` | A procedure with distinct stages. Start each step with a `###` heading. |
| `<Tabs items={[...]}>` and `<Tab value>` | Equivalent choices, such as a language or an agent. Tabs with the same `groupId` switch together, and `persist` remembers the choice. |
| ` ```npm ` code block | An install command. It renders as npm, pnpm, yarn and bun tabs. |
| ` ```bash title=".env" ` | A code block with a file name above it. |
| `<Callout type="warn" title>` | A constraint or warning beside the main flow. `type` is `info` (the default), `tip` or `warn`. |
| `<Params>` and `<Param name type default required>` | The inputs of a function or command, with a sentence on each. |
| `<Files>`, `<Folder name>` and `<File name>` | A folder layout, with an optional line on what each file is for. |
| `<Kbd>` | A keyboard shortcut in running text, such as `<Kbd>Ctrl+K</Kbd>`. |
| `<Cards>` and `<Card>` | An index of pages, described below. |
| `<FeatureCards>` and `<FeatureCard art title href description>` | The main entry points of an overview, each with a line drawing. `art` is `paste`, `agent`, `server` or `api`; add a drawing in `components/feature-cards.tsx` for a new one. |

`components/prose.tsx` holds the callout, parameter and file tree components, and
`components/tabs.tsx` gives Fumadocs' tabs the app's look.

Diagrams are React components in `components/visuals.tsx`, registered in `components/mdx.tsx`
and placed in a page as `<FirstPasteVisual />`. They draw miniature app screens with the tokens and
components from `@sniptide/ui`, so they follow the theme in light and dark mode and stack into one
column on phones. The miniature screens are hidden from screen readers, so the text beside them and
the figure's label carry the meaning. Keep each diagram's wording in step with the app's messages
and the page it illustrates.

Store screenshots in `public/visuals` and reference them from MDX with descriptive alternative
text. `bun run test:docs` checks that local Markdown images have alternative text and exist; the
Docker image copies `public` into the standalone server.

Search is built in (Orama, served from `/api/search`) and needs no setup.

Index pages list their children with `<Cards>` and `<Card icon={<ServerIcon />} title href
description />`, the docs' own cards in `components/cards.tsx`. Icons come from `lucide-react` and
are registered in `components/mdx.tsx`.

Every page title has a **Copy page** button (`components/page-actions.tsx`). It copies the page as
Markdown, and its menu opens the page in ChatGPT or Claude. The Markdown is served at
`/llms.mdx/<path>`, such as `/llms.mdx/mcp`, by `app/llms.mdx`, with heading ids removed and links
made absolute.

Every page ends with "Was this helpful?" (`components/feedback.tsx`). The answers post to
`/api/feedback`, which forwards them to PostHog when `POSTHOG_KEY` is set.

## Languages

The docs follow the app's five languages: English at the root and German, Spanish, Japanese and
Chinese under `/de`, `/es`, `/ja` and `/zh` (`lib/i18n.ts`, with `proxy.ts` serving English paths
without a prefix). The header and footer text is in `lib/messages.ts`, and Fumadocs' own text
(search, table of contents, pagination) in `lib/i18n-ui.ts`.

To translate a page, add a file next to it with the language before the extension, such as
`content/docs/mcp.de.mdx`, and translate `meta.json` the same way as `meta.de.json`. Until a page has
a translation, its URL in that language shows the English text in the translated interface, names
the English page as canonical and stays out of the sitemap. Links in the content use English paths
such as `/mcp`, and readers stay in their language when they follow them.

## Look

`app/global.css` imports `@sniptide/ui/globals.css` (the palette and tokens the app uses) and maps
Fumadocs' colours onto them, and `app/[lang]/layout.tsx` loads the same three fonts as the app, so the
docs follow the app's theme, light and dark.

## Configuration

| Variable | Default | What it does |
| --- | --- | --- |
| `APP_URL` | `https://app.sniptide.com` | Where the Sniptide app runs. The nav links to its `/docs/api` and to the app. Read at build time (the pages are prerendered), so it is a build argument in the Dockerfile. |
| `SITE_URL` | `https://docs.sniptide.com` | Where the docs are served. Canonical links, the sitemap and link previews use it. Read at build time, like `APP_URL`. |
| `POSTHOG_KEY` | none | PostHog project key for the "Was this helpful?" answers at the end of each page. The server forwards each answer as an anonymous `docs_feedback` event, so the docs load no analytics script and set no cookie. Without it the answers are dropped. Read when the server runs. |
| `POSTHOG_HOST` | `https://us.i.posthog.com` | PostHog API host, such as `https://eu.i.posthog.com` for the EU region. |

## Deploying

`Dockerfile` builds a standalone server. Build it from the repository root:

```bash
docker build -f apps/docs/Dockerfile --build-arg APP_URL=https://app.example.com -t sniptide-docs .
docker run -p 3000:3000 sniptide-docs
```

For Coolify, use this repository on branch `main` with the Dockerfile build pack. Set the base
directory to `/` and Dockerfile location to `/apps/docs/Dockerfile`. Expose port `3000` and use
`GET /` for the health check. Set `APP_URL` and `SITE_URL` as build variables for your domains.
The service needs no database.

## Search engines and link previews

Every page gets its title and description from the MDX frontmatter, a canonical link, Open Graph and
Twitter tags, and `TechArticle` and `BreadcrumbList` markup (`app/[lang]/[[...slug]]/page.tsx`,
`lib/structured-data.ts`). The preview image of a page is generated at build time by
`app/og/[...slug]/route.tsx` and `lib/og.tsx`: the pink brand card with the page title and a blue
pixel tide (`lib/og-tide.ts`), with the font in `assets/fonts`. `app/sitemap.ts` lists the pages and their translations from the same source as the sidebar, and
`app/robots.ts` allows crawling and links the sitemap, so a new page needs nothing beyond its MDX
file and a good `description` in its frontmatter (about 120 to 160 characters).
