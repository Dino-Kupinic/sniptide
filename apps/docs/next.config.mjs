import path from "node:path"
import { createMDX } from "fumadocs-mdx/next"

const isDev = process.env.NODE_ENV === "development"

// Same policy as the app (apps/web/next.config.ts): no nonces, so Next's inline bootstrap
// scripts need 'unsafe-inline', and React needs 'unsafe-eval' in development only.
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
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
]

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Self-contained server for the Docker image (apps/docs/.next/standalone). Tracing from the
  // repo root so the workspace packages are included.
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  poweredByHeader: false,
  transpilePackages: ["@sniptide/ui"],
  experimental: {
    // Each page carries its CSS in <style> tags instead of <link>ed files. The stylesheet names are
    // build hashes, so a page from one build whose stylesheet request reaches a server running
    // another (the old and new containers overlap during a deploy, and a browser can restore an old
    // page from its cache) gets a 404 and renders unstyled. Inlined, a page always has its styles.
    // The cost is about 60 kB more gzipped HTML per full page load, since Next also repeats the CSS
    // in the RSC payload.
    inlineCss: true,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
}

export default createMDX()(config)
