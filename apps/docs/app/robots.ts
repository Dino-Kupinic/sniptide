import type { MetadataRoute } from "next"
import { absoluteUrl } from "@/lib/site"

// Every page may be crawled, and /_next stays open because search engines load its scripts, styles
// and fonts to render the pages. The search and feedback endpoints under /api have nothing to
// index, and paths such as /api/v1 that the guides mention belong to the app. The link Cloudflare's
// email obfuscation puts in place of a mailto: address has nothing to index either.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/cdn-cgi/l/email-protection"] },
    sitemap: absoluteUrl("/sitemap.xml"),
  }
}
