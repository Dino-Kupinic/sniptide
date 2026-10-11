import { web } from "@e2e-dev/web"
import type { E2EConfig } from "e2e"
import { databaseUrl } from "./tests/environment"

const url = "http://localhost:3100"

export default {
  tests: "tests/**/*.e2e.ts",
  workers: 1,
  assertionTimeout: 10_000,
  trace: "retain-on-failure",
  reporters: ["list", "junit", "markdown"],
  credentials: {
    tester: {
      username: "browser@example.test",
      password: () => process.env.E2E_ACCOUNT_PASSWORD ?? "",
    },
  },
  secrets: {
    pastePassword: () => process.env.E2E_PASTE_PASSWORD ?? "",
    wrongPassword: () => process.env.E2E_WRONG_PASSWORD ?? "",
  },
  targets: [
    {
      name: "chromium",
      engine: web({ viewport: { width: 1280, height: 900 } }),
      app: {
        url,
        readyUrl: `${url}/api/health`,
        environment: "test",
        command: {
          executable: "node",
          args: [
            "node_modules/next/dist/bin/next",
            process.env.CI ? "start" : "dev",
            "--port",
            "3100",
          ],
          env: {
            DATABASE_URL: databaseUrl(),
            BETTER_AUTH_SECRET: process.env.E2E_AUTH_SECRET ?? "",
            BETTER_AUTH_URL: url,
            SHARE_URL: "",
            COOKIE_DOMAIN: "",
            ALLOWED_EMAILS: "",
            POSTHOG_KEY: "",
            GITHUB_CLIENT_ID: "",
            GITHUB_CLIENT_SECRET: "",
            GOOGLE_CLIENT_ID: "",
            GOOGLE_CLIENT_SECRET: "",
            CLIENT_IP_SOURCE: "direct",
            NEXT_TELEMETRY_DISABLED: "1",
          },
          startupTimeout: 120_000,
          log: ".e2e/logs/app.log",
        },
      },
    },
  ],
} satisfies E2EConfig
