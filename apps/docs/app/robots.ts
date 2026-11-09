import type { MetadataRoute } from "next"
import { absoluteUrl } from "@/lib/site"

// Every page may be crawled, and /_next stays open because search engines load its scripts, styles
// and fonts to render the pages. The search and feedback endpoints under /api have nothing to
// index, and paths such as /api/v1 that the guides mention belong to the app. Cloudflare writes
// /cdn-cgi/l/email-protection links into pages when its email obfuscation is on, and they answer
// 404 when followed.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/cdn-cgi/"] },
    sitemap: absoluteUrl("/sitemap.xml"),
  }
}
