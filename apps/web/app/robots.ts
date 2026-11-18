import type { MetadataRoute } from "next"
import { hasFeature } from "@/lib/edition"

export const dynamic = "force-dynamic"

// Share pages may be crawled: public pastes are meant to be found, and unlisted and private ones
// mark themselves noindex. /_next stays open because search engines load its scripts, styles and
// fonts to render those pages. The API has nothing to index.
export default function robots(): MetadataRoute.Robots {
  if (!hasFeature("discovery"))
    // Allow crawlers to read the noindex header on self-hosted pages.
    return { rules: { userAgent: "*", disallow: ["/api/", "/_next/"] } }

  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
  }
}
