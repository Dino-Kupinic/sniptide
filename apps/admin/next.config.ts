import path from "node:path"
import type { NextConfig } from "next"

const isDev = process.env.NODE_ENV === "development"

// The email preview is an iframe with srcdoc, which inherits this policy, so it allows https
// images (screenshots and the logo) and fonts from the Sniptide app.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data: https:${isDev ? " http://localhost:*" : ""}`,
  `font-src 'self' https:${isDev ? " http://localhost:*" : ""}`,
  "connect-src 'self'",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ")

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
]

const config: NextConfig = {
  reactStrictMode: true,
  // Self-contained server for the Docker image (apps/admin/.next/standalone), traced from the repo
  // root so the workspace packages are included.
  output: "standalone",
  // The floating dev badge would cover Sign out in the sidebar.
  devIndicators: false,
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  poweredByHeader: false,
  transpilePackages: ["@sniptide/ui", "@workspace/db", "@workspace/email"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
}

export default config
