import "dotenv/config"
import { defineConfig } from "drizzle-kit"

// `generate` only needs the schema. The D1 HTTP credentials are only read by commands that talk
// to the remote database (push, studio); local and remote migrations are applied with wrangler.
export default defineConfig({
  out: "./migrations",
  schema: "./src/schema/index.ts",
  dialect: "sqlite",
  driver: "d1-http",
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
    databaseId: process.env.CLOUDFLARE_DATABASE_ID ?? "",
    token: process.env.CLOUDFLARE_D1_TOKEN ?? "",
  },
})
