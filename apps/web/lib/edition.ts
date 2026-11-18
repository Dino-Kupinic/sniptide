export const EDITIONS = ["selfhost", "cloud"] as const
type CloudFeature = "discovery" | "gallery" | "shortLinks"
type EditionConfig = { edition: (typeof EDITIONS)[number] }

// Proxy reads the edition at request time too, without loading the full server configuration.
export function isCloud(config?: EditionConfig): boolean {
  return (config?.edition ?? process.env.SNIPTIDE_EDITION?.trim()) === "cloud"
}

export function hasFeature(feature: CloudFeature, config?: EditionConfig): boolean {
  switch (feature) {
    case "discovery":
    case "gallery":
    case "shortLinks":
      return isCloud(config)
  }
}

export function shareUrlForEdition(value: string | undefined, config?: EditionConfig) {
  const url = URL.parse(value?.trim() ?? "")
  if (!url) return undefined

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "")
  const hostedDomain = hostname === "sniptide.com" || hostname === "www.sniptide.com"
  return hostedDomain && !hasFeature("shortLinks", config) ? undefined : value?.trim()
}
