import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  serverExternalPackages: ["drizzle-orm"],
  transpilePackages: ["@workspace/db", "@workspace/ui"],
}

export default nextConfig
