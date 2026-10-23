// Where the account menu's resource links go: the marketing site, the docs site (apps/docs) and
// GitHub issues. Self-hosted instances override each with HOMEPAGE_URL, DOCS_URL and HELP_URL (see
// lib/config.ts); these are the defaults.
export interface ResourceLinks {
  homepage: string
  documentation: string
  help: string
}

export const DEFAULT_RESOURCE_LINKS: ResourceLinks = {
  homepage: "https://sniptide.com",
  documentation: "https://docs.sniptide.com",
  help: "https://github.com/Dino-Kupinic/sniptide/issues",
}
