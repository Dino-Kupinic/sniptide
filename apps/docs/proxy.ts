import { createI18nMiddleware } from "fumadocs-core/i18n/middleware"
import { i18n } from "@/lib/i18n"

// English pages have no language segment, so the proxy rewrites /mcp to /en/mcp, and /de/mcp is
// served as it is.
export default createI18nMiddleware(i18n)

// Everything but the pages: route handlers, Next's own files, Open Graph images, the metadata
// routes and files with an extension.
export const config = {
  matcher: ["/((?!api/|og/|_next/|.*\\..*).*)"],
}
