import path from "node:path"
import { validateTestDatabaseUrl } from "../test/database-url"

const [mode = "all", ...filters] = process.argv.slice(2)
if (!["all", "unit", "integration"].includes(mode)) {
  console.error("Use test.ts all, unit, or integration.")
  process.exit(1)
}

const env = { ...process.env }
if (mode === "unit") {
  env.TEST_DATABASE_URL = ""
  env.DATABASE_URL = ""
  console.info("Unit tests only. Database integration coverage is excluded.")
} else if (env.TEST_DATABASE_URL) {
  try {
    env.DATABASE_URL = validateTestDatabaseUrl(env.TEST_DATABASE_URL)
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid TEST_DATABASE_URL.")
    process.exit(1)
  }
  console.info("Database integration coverage enabled on the dedicated test database.")
} else if (mode === "integration") {
  console.error("TEST_DATABASE_URL is required for integration tests. No database setup ran.")
  process.exit(1)
} else {
  env.TEST_DATABASE_URL = ""
  env.DATABASE_URL = ""
  console.warn("Database integration coverage SKIPPED. Set TEST_DATABASE_URL to enable it.")
}

const cwd = path.join(import.meta.dir, "..")
const tests = Bun.spawn(
  [process.execPath, "--no-env-file", "test", ...(filters.length ? filters : ["./test"])],
  {
    cwd,
    env,
    stdout: "inherit",
    stderr: "inherit",
  },
)
const code = await tests.exited
if (code !== 0) process.exit(code)
if (filters.length === 0) {
  const admission = Bun.spawn(["node", "./test/run-admission-node.mjs"], {
    cwd,
    env,
    stdout: "inherit",
    stderr: "inherit",
  })
  process.exit(await admission.exited)
}
