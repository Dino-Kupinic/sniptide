import type { MetadataRoute } from "next"

// Share pages may be crawled: public pastes are meant to be found, and unlisted and private ones
// mark themselves noindex. /_next stays open because search engines load its scripts, styles and
// fonts to render those pages. The API and Cloudflare's /cdn-cgi paths have nothing to index.
// Cloudflare writes /cdn-cgi/l/email-protection links into pages when its email obfuscation is
// on, and they answer 404 when followed.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/cdn-cgi/"] },
  }
}
