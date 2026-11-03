import { describe, expect, test } from "bun:test"
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const web = path.join(import.meta.dir, "..")
function run(args: string[], url?: string) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: "postgres://localhost/application",
  }
  delete env.TEST_DATABASE_URL
  if (url !== undefined) env.TEST_DATABASE_URL = url
  const result = Bun.spawnSync([process.execPath, ...args], { cwd: web, env })
  return { code: result.exitCode, output: result.stdout.toString() + result.stderr.toString() }
}

describe("test command boundary", () => {
  test("integration refuses a missing database before setup", () => {
    const result = run(["scripts/test.ts", "integration"])
    expect(result.code).not.toBe(0)
    expect(result.output).toContain("TEST_DATABASE_URL is required")
    expect(result.output).not.toContain("bun test")
  })

  test("integration refuses a deceptive URL before setup", () => {
    const result = run(
      ["scripts/test.ts", "integration"],
      "postgres://localhost/application?application_name=foo_test",
    )
    expect(result.code).not.toBe(0)
    expect(result.output).toContain("TEST_DATABASE_URL must")
    expect(result.output).not.toContain("bun test")
  })

  test("the harness refuses unsafe URLs before a database function runs", () => {
    const result = run(
      ["test/fixtures/database-boundary.ts"],
      "postgres://localhost/application?application_name=foo_test",
    )
    expect(result.code).not.toBe(0)
    expect(result.output).toContain("TEST_DATABASE_URL must")
    expect(result.output).not.toContain("DATABASE_SETUP_REACHED")
  })

  test("the harness refuses setup without a dedicated database", () => {
    const result = run(["test/fixtures/database-boundary.ts"])
    expect(result.code).not.toBe(0)
    expect(result.output).toContain("TEST_DATABASE_URL is required")
    expect(result.output).not.toContain("DATABASE_SETUP_REACHED")
  })

  test("unit mode ignores ambient database configuration", () => {
    const result = run(
      ["scripts/test.ts", "unit", "./test/database-url.test.ts"],
      "postgres://localhost/application?application_name=foo_test",
    )
    expect(result.code).toBe(0)
    expect(result.output).toContain("Database integration coverage is excluded")
  })

  test("aggregate mode explicitly reports missing database coverage", () => {
    const result = run(["scripts/test.ts", "all", "./test/database-url.test.ts"])
    expect(result.code).toBe(0)
    expect(result.output).toContain("Database integration coverage SKIPPED")
  })

  test("unit children cannot reload database URLs from dotenv files", () => {
    const folder = mkdtempSync(path.join(os.tmpdir(), "sniptide-wrk416-dotenv-"))
    try {
      mkdirSync(path.join(folder, "scripts"))
      mkdirSync(path.join(folder, "test"))
      copyFileSync(path.join(web, "scripts/test.ts"), path.join(folder, "scripts/test.ts"))
      copyFileSync(
        path.join(web, "test/database-url.ts"),
        path.join(folder, "test/database-url.ts"),
      )
      writeFileSync(
        path.join(folder, ".env.test"),
        "TEST_DATABASE_URL=postgres://localhost/dotenv_test\nDATABASE_URL=postgres://localhost/application\n",
      )
      writeFileSync(
        path.join(folder, "test/env.test.ts"),
        `
        import { expect, test } from "bun:test"
        test("no database setup", () => {
          expect(process.env.TEST_DATABASE_URL ?? "").toBe("")
          expect(process.env.DATABASE_URL ?? "").toBe("")
        })
      `,
      )
      const result = Bun.spawnSync(
        [process.execPath, "scripts/test.ts", "unit", "./test/env.test.ts"],
        {
          cwd: folder,
          env: { ...process.env, NODE_ENV: "test" },
        },
      )
      expect(result.exitCode).toBe(0)
      expect(result.stdout.toString() + result.stderr.toString()).toContain("1 pass")
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })
})
