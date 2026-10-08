import path from "node:path"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Self-contained server for the Docker image (apps/web/.next/standalone). Tracing from the
  // repo root so the workspace packages are included.
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  // libSQL loads a native SQLite binding at runtime; leave it to Node instead of bundling.
  serverExternalPackages: ["@libsql/client", "libsql"],
  // Keeps the dev badge clear of the sidebar's account menu.
  devIndicators: { position: "bottom-right" },
  transpilePackages: ["@workspace/auth", "@workspace/db", "@workspace/ui"],
}

export default nextConfig
