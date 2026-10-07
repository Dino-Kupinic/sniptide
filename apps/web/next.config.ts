import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["@workspace/auth", "@workspace/db", "@workspace/ui"],
}

export default nextConfig

// Exposes the wrangler.jsonc bindings (D1, vars, .dev.vars) to `next dev` via getCloudflareContext.
initOpenNextCloudflareForDev()
