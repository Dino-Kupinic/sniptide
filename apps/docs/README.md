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

## Deploying

`Dockerfile` builds a standalone server. Build it from the repository root:

```bash
docker build -f apps/docs/Dockerfile --build-arg APP_URL=https://app.example.com -t sniptide-docs .
docker run -p 3000:3000 sniptide-docs
```

The root README describes the Coolify service.
