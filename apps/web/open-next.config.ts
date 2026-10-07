import { defineCloudflareConfig } from "@opennextjs/cloudflare"

// No incremental cache yet: pages are dynamic or static. Add the R2 cache when ISR is needed.
// See https://opennext.js.org/cloudflare/caching
export default defineCloudflareConfig()
