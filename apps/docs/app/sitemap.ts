import type { MetadataRoute } from "next"
import { absoluteUrl } from "@/lib/site"
import { source } from "@/lib/source"

// Every docs page, from the same source as the sidebar, so a new page appears here without edits.
export default function sitemap(): MetadataRoute.Sitemap {
  return source.getPages().map((page) => ({ url: absoluteUrl(page.url) }))
}
