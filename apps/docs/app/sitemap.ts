import type { MetadataRoute } from "next"
import { absoluteUrl } from "@/lib/site"
import { isTranslated, source } from "@/lib/source"

// Every docs page in every language it is written in, from the same source as the sidebar, so a
// new page or translation appears here without edits. Untranslated pages are left out, since their
// canonical link is the English page.
export default function sitemap(): MetadataRoute.Sitemap {
  return source
    .getLanguages()
    .flatMap(({ pages }) => pages)
    .filter(isTranslated)
    .map((page) => ({ url: absoluteUrl(page.url) }))
}
