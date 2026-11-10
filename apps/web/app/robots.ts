import type { MetadataRoute } from "next"

// Share pages may be crawled: public pastes are meant to be found, and unlisted and private ones
// mark themselves noindex. /_next stays open because search engines load its scripts, styles and
// fonts to render those pages. The API has nothing to index.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
  }
}
