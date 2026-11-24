import type { MetadataRoute } from "next"
import lastModified from "@/lib/last-modified.json"
import { absoluteUrl } from "@/lib/site"
import { isTranslated, source } from "@/lib/source"

// Every docs page in every language it is written in, from the same source as the sidebar, so a
// new page or translation appears here without edits. Untranslated pages are left out, since their
// canonical link is the English page. Each page is dated by when its file last changed, from
// lib/last-modified.json (scripts/last-modified.ts).
export default function sitemap(): MetadataRoute.Sitemap {
  const dates: Record<string, string | undefined> = lastModified
  return source
    .getLanguages()
    .flatMap(({ pages }) => pages)
    .filter(isTranslated)
    .map((page) => ({ url: absoluteUrl(page.url), lastModified: dates[page.path] }))
}
