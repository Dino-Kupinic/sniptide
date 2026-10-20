// Where the account menu's resource links go. Self-hosted instances override each with
// HOMEPAGE_URL, DOCS_URL and HELP_URL (see lib/config.ts); these are the defaults.
export interface ResourceLinks {
  homepage: string
  documentation: string
  help: string
}

export const DEFAULT_RESOURCE_LINKS: ResourceLinks = {
  homepage: "https://sniptide.com",
  documentation: "https://github.com/Dino-Kupinic/sniptide#readme",
  help: "https://github.com/Dino-Kupinic/sniptide/issues",
}
