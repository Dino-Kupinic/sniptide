import path from "node:path"
import type { NextConfig } from "next"

const isDev = process.env.NODE_ENV === "development"

// Without nonces, so pages stay as they render today; Next's inline bootstrap scripts need
// 'unsafe-inline', and React needs 'unsafe-eval' in development only. img-src allows https for
// the avatars GitHub and Google hand over at sign-up.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ")

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Browsers ignore it over plain http, so local and self-hosted http setups are unaffected.
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
]

const nextConfig: NextConfig = {
  // Self-contained server for the Docker image (apps/web/.next/standalone). Tracing from the
  // repo root so the workspace packages are included.
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  // Keeps the dev badge clear of the sidebar's account menu.
  devIndicators: { position: "bottom-right" },
  poweredByHeader: false,
  transpilePackages: ["@workspace/auth", "@workspace/db", "@sniptide/ui"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
}

export default nextConfig
