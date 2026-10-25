// The docs are served from the root of their own domain (docs.sniptide.com).
export const docsRoute = "/"

export const gitHubUrl = "https://github.com/Dino-Kupinic/sniptide"

export const siteName = "Sniptide docs"
export const siteDescription = "Guides and concepts for Sniptide, the self-hostable pastebin."

// Where these docs are served, for canonical links, the sitemap and link previews. Like APP_URL it
// is read when the site is built (a build argument in the Dockerfile), because the pages are
// prerendered.
const DEFAULT_SITE_URL = "https://docs.sniptide.com"

export function siteUrl() {
  return (process.env.SITE_URL?.trim() || DEFAULT_SITE_URL).replace(/\/+$/, "")
}

// A path on this site as a full URL. The home page has no trailing slash, as in its canonical link.
export function absoluteUrl(path: string) {
  return path === "/" ? siteUrl() : `${siteUrl()}${path}`
}

// The Open Graph image of a page, from app/og/[...slug]/route.tsx. The home page has no slug, so
// its image is /og/image.png.
export function ogImagePath(slugs: string[]) {
  return `/og/${[...slugs, "image.png"].join("/")}`
}

// Where the Sniptide app runs. The API reference is served by the app itself (/docs/api), so the
// nav links there. The pages are prerendered, so APP_URL is read when the site is built (a build
// argument in the Dockerfile), not when it starts.
const DEFAULT_APP_URL = "https://app.sniptide.com"

export function appUrl() {
  return (process.env.APP_URL?.trim() || DEFAULT_APP_URL).replace(/\/+$/, "")
}
