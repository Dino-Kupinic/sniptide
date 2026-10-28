import path from "node:path"
import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const isDev = process.env.NODE_ENV === "development"

// Without nonces, so pages stay as they render today; Next's inline bootstrap scripts need
// 'unsafe-inline', and React needs 'unsafe-eval' in development only. img-src allows https for
// the avatars GitHub and Google hand over at sign-up.
const contentSecurityPolicy = (frameAncestors: string) =>
  [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
  ].join("; ")

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Browsers ignore it over plain http, so local and self-hosted http setups are unaffected.
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
]

// A paste's embed view, /<slug>/embed, is the one page other sites may frame. The app's own routes
// with a dynamic second segment are left out, so /pastes/embed (a paste named "embed") stays
// unframeable. `framedPath` matches every other path, exactly the complement.
const appSegments = "(?:pastes|collections|secrets|secret-share)"
const embedPath = `/:slug((?!${appSegments}/)[A-Za-z0-9_-]+)/embed`
const framedPath = `/:path((?!(?!${appSegments}/)[A-Za-z0-9_-]+/embed$).*)`

const nextConfig: NextConfig = {
  // Self-contained server for the Docker image (apps/web/.next/standalone). Tracing from the
  // repo root so the workspace packages are included.
  output: "standalone",
  deploymentId: process.env.DEPLOYMENT_VERSION || undefined,
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  // Next's tracer cannot infer these runtime asset reads, so include them in the standalone build.
  outputFileTracingIncludes: {
    "/[slug]": [
      "./assets/fonts/**/*",
      "../../packages/ui/src/fonts/PaperMono-Regular.ttf",
      "./assets/preview/**/*",
    ],
    "/[slug]/preview": ["./assets/fonts/**/*", "../../packages/ui/src/fonts/PaperMono-Regular.ttf"],
    "/[slug]/preview.mp4": [
      "./assets/fonts/**/*",
      "../../packages/ui/src/fonts/PaperMono-Regular.ttf",
      "./assets/preview/**/*",
    ],
  },
  // Keeps the dev badge clear of the sidebar's account menu.
  devIndicators: { position: "bottom-right" },
  poweredByHeader: false,
  transpilePackages: ["@workspace/auth", "@workspace/db", "@sniptide/ui"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: framedPath,
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy("'none'") },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      {
        // readEmbedPaste only serves pastes that are safe to show inside another site.
        source: embedPath,
        headers: [{ key: "Content-Security-Policy", value: contentSecurityPolicy("*") }],
      },
      ...["/secrets/:path*", "/secret-share/:path*"].map((source) => ({
        source,
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      })),
    ]
  },
}

export default createNextIntlPlugin()(nextConfig)
