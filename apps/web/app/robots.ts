import type { MetadataRoute } from "next"
import { hasFeature } from "@/lib/edition"

export const dynamic = "force-dynamic"

const EMAIL_PROTECTION = "/cdn-cgi/l/email-protection"

// Share pages may be crawled: public pastes are meant to be found, and unlisted and private ones,
// like public pastes from new accounts, mark themselves noindex. /_next stays open because search
// engines load its scripts, styles and fonts to render those pages. The API has nothing to index,
// and neither does the link Cloudflare's email obfuscation puts in place of a mailto: address.
export default function robots(): MetadataRoute.Robots {
  if (!hasFeature("discovery"))
    // Allow crawlers to read the noindex header on self-hosted pages.
    return { rules: { userAgent: "*", disallow: ["/api/", "/_next/", EMAIL_PROTECTION] } }

  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", EMAIL_PROTECTION] },
  }
}
