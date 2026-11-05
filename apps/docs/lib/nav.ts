import { localePath, stripLocale } from "./i18n"
import type { Messages } from "./messages"
import { appUrl, gitHubUrl, marketingUrl, releasesUrl, xUrl } from "./site"

export type NavSection = {
  label: keyof Messages
  href: string
  // The first path segments that belong to this section, so its header link shows as current.
  match: string[]
}

// The header's sections, in the order of the sidebar. A page whose path matches none of them is a
// guide, so the first section also covers the overview and every unmatched page.
export const navSections: NavSection[] = [
  {
    label: "guides",
    href: "/getting-started",
    match: ["", "getting-started", "core-concepts", "settings", "support", "troubleshooting"],
  },
  { label: "agents", href: "/mcp", match: ["mcp", "oauth", "cli", "sdks", "agent-sandbox"] },
  { label: "api", href: "/api-tokens", match: ["api-tokens", "api-reliability"] },
  { label: "selfHosting", href: "/self-hosting", match: ["self-hosting"] },
]

export function activeSection(pathname: string) {
  const first = stripLocale(pathname).split("/").filter(Boolean)[0] ?? ""
  return navSections.find((section) => section.match.includes(first)) ?? navSections[0]
}

export type FooterLink = { label: keyof Messages; href: string; external?: boolean }
export type FooterColumn = { label: keyof Messages; links: FooterLink[] }

// The marketing site's footer columns (sniptide-web components/site-footer.tsx), with links into
// these docs kept on this site and in the reader's language.
export function footerColumns(lang: string): FooterColumn[] {
  const docs = (path: string) => localePath(lang, path)
  return [
    {
      label: "product",
      links: [
        { label: "snippetLibrary", href: `${marketingUrl}/#features` },
        { label: "folderSync", href: `${marketingUrl}/#recipes` },
        { label: "revisions", href: docs("/core-concepts/revisions") },
        { label: "gistImport", href: docs("/getting-started/import-gist") },
        { label: "sharing", href: `${marketingUrl}/#sharing` },
        { label: "envSync", href: `${marketingUrl}/#secrets` },
        { label: "analytics", href: docs("/core-concepts/analytics") },
        { label: "liveDemo", href: "https://demo.sniptide.com/demo" },
      ],
    },
    {
      label: "developers",
      links: [
        { label: "mcpServer", href: docs("/mcp") },
        { label: "cli", href: docs("/cli") },
        { label: "oauth", href: docs("/oauth") },
        { label: "restApi", href: `${appUrl()}/docs/api` },
        { label: "sdks", href: docs("/sdks") },
        { label: "selfHosting", href: docs("/self-hosting") },
        { label: "documentation", href: docs("/") },
      ],
    },
    {
      label: "resources",
      links: [
        { label: "vision", href: `${marketingUrl}/vision` },
        { label: "blog", href: `${marketingUrl}/blog` },
        { label: "contact", href: `${marketingUrl}/contact` },
        { label: "brand", href: `${marketingUrl}/brand` },
        { label: "releases", href: releasesUrl, external: true },
        { label: "openSource", href: gitHubUrl, external: true },
      ],
    },
    {
      label: "social",
      links: [
        { label: "x", href: xUrl, external: true },
        { label: "gitHubShort", href: gitHubUrl, external: true },
      ],
    },
  ]
}

export const legalLinks: FooterLink[] = [
  { label: "terms", href: `${marketingUrl}/terms` },
  { label: "privacy", href: `${marketingUrl}/privacy` },
  { label: "impressum", href: `${marketingUrl}/impressum` },
]
