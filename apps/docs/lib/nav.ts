import { appUrl, gitHubUrl, marketingUrl, releasesUrl, xUrl } from "./site"

export type NavSection = {
  label: string
  href: string
  // The first path segments that belong to this section, so its header link shows as current.
  match: string[]
}

// The header's sections, in the order of the sidebar. A page whose path matches none of them is a
// guide, so the first section also covers the overview and every unmatched page.
export const navSections: NavSection[] = [
  {
    label: "Guides",
    href: "/getting-started",
    match: ["", "getting-started", "core-concepts", "settings", "support", "troubleshooting"],
  },
  { label: "Agents", href: "/mcp", match: ["mcp", "oauth", "cli", "sdks", "agent-sandbox"] },
  { label: "API", href: "/api-tokens", match: ["api-tokens", "api-reliability"] },
  { label: "Self-hosting", href: "/self-hosting", match: ["self-hosting"] },
]

export function activeSection(pathname: string) {
  const first = pathname.split("/").filter(Boolean)[0] ?? ""
  return navSections.find((section) => section.match.includes(first)) ?? navSections[0]
}

export type FooterLink = { label: string; href: string }

// The footer's links out of the docs: the rest of Sniptide and its profiles.
export function footerLinks(): FooterLink[] {
  return [
    { label: "sniptide.com", href: marketingUrl },
    { label: "Sniptide app", href: appUrl() },
    { label: "GitHub", href: gitHubUrl },
    { label: "Releases", href: releasesUrl },
    { label: "X", href: xUrl },
  ]
}

export const legalLinks: FooterLink[] = [
  { label: "Terms", href: `${marketingUrl}/terms` },
  { label: "Privacy", href: `${marketingUrl}/privacy` },
  { label: "Impressum", href: `${marketingUrl}/impressum` },
]
