import { absoluteUrl, ogImagePath, siteName } from "@/lib/site"

interface PageInfo {
  title: string
  description?: string
  url: string
  slugs: string[]
}

// The home page is the first crumb, and the page's own title is the last.
type Crumb = { name: string; path: string }

const organization = { "@type": "Organization", name: "Sniptide", url: "https://sniptide.com" }

// schema.org markup for one docs page: the article itself and where it sits in the docs.
export function pageStructuredData(page: PageInfo, crumbs: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        headline: page.title,
        description: page.description,
        url: absoluteUrl(page.url),
        image: absoluteUrl(ogImagePath(page.slugs)),
        inLanguage: "en",
        isPartOf: { "@type": "WebSite", name: siteName, url: absoluteUrl("/") },
        publisher: organization,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: crumbs.map((crumb, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: crumb.name,
          item: absoluteUrl(crumb.path),
        })),
      },
    ],
  }
}

// JSON.stringify doesn't escape "<", so "</script>" in a value would end the tag early.
export function serializeJsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c")
}
