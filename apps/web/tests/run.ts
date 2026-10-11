import { randomBytes } from "node:crypto"
import { fileURLToPath } from "node:url"
import { databaseUrl } from "./environment"

databaseUrl()
const child = Bun.spawn(["node", "node_modules/.bin/e2e", ...process.argv.slice(2)], {
  cwd: fileURLToPath(new URL("../", import.meta.url)),
  env: {
    ...process.env,
    E2E_AUTH_SECRET: randomBytes(32).toString("hex"),
    E2E_ACCOUNT_PASSWORD: randomBytes(24).toString("hex"),
    E2E_PASTE_PASSWORD: randomBytes(24).toString("hex"),
    E2E_WRONG_PASSWORD: randomBytes(24).toString("hex"),
    E2E_TELEMETRY_DISABLED: "1",
  },
  stdout: "inherit",
  stderr: "inherit",
})
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => child.kill(signal))
}
process.exit(await child.exited)
