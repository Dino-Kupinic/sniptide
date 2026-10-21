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
heading comes from the `title` in the frontmatter, so start the body at `##`. Fumadocs' built-in
components (`Cards`, `Callout`, `Tabs`, `Steps`, …) are available in every page.

Search is built in (Orama, served from `/api/search`) and needs no setup.

## Look

`app/global.css` imports `@sniptide/ui/globals.css` (the palette and tokens the app uses) and maps
Fumadocs' colours onto them, and `app/layout.tsx` loads the same three fonts as the app, so the
docs follow the app's theme, light and dark.

## Configuration

| Variable | Default | What it does |
| --- | --- | --- |
| `APP_URL` | `https://app.sniptide.com` | Where the Sniptide app runs. The nav links to its `/docs/api` and to the app. Read at build time (the pages are prerendered), so it is a build argument in the Dockerfile. |
| `SITE_URL` | `https://docs.sniptide.com` | Where the docs are served. Canonical links, the sitemap and link previews use it. Read at build time, like `APP_URL`. |

## Deploying

`Dockerfile` builds a standalone server. Build it from the repository root:

```bash
docker build -f apps/docs/Dockerfile --build-arg APP_URL=https://app.example.com -t sniptide-docs .
docker run -p 3000:3000 sniptide-docs
```

The root README describes the Coolify service.

## Search engines and link previews

Every page gets its title and description from the MDX frontmatter, a canonical link, Open Graph and
Twitter tags, and `TechArticle` and `BreadcrumbList` markup (`app/[[...slug]]/page.tsx`,
`lib/structured-data.ts`). The preview image of a page is generated at build time by
`app/og/[...slug]/route.tsx` and `lib/og.tsx` from its title and description, with the fonts in
`assets/fonts`. `app/sitemap.ts` lists the pages from the same source as the sidebar, and
`app/robots.ts` allows crawling and links the sitemap, so a new page needs nothing beyond its MDX
file and a good `description` in its frontmatter (about 120 to 160 characters).
