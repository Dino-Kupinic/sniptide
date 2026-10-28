import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)))
const sdk = join(root, "packages/sdk")
const temp = mkdtempSync(join(tmpdir(), "sniptide-sdk-pack-"))
try {
  const env = { ...process.env, npm_config_cache: join(temp, "cache") }
  execFileSync("bun", ["run", "build"], { cwd: sdk, stdio: "inherit" })
  const pack = JSON.parse(
    execFileSync("npm", ["pack", "--json", "--pack-destination", temp], {
      cwd: sdk,
      encoding: "utf8",
      env,
    }),
  )
  writeFileSync(join(temp, "package.json"), '{"type":"module","private":true}')
  execFileSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--offline",
      "--no-audit",
      "--no-fund",
      join(temp, pack[0].filename),
    ],
    { cwd: temp, stdio: "inherit", env },
  )
  writeFileSync(
    join(temp, "index.mjs"),
    'import { SniptideClient } from "@sniptide/sdk"; if (typeof SniptideClient !== "function") throw new Error("missing client")',
  )
  writeFileSync(
    join(temp, "index.ts"),
    'import { SniptideClient, type EnvVariable } from "@sniptide/sdk"; const v: EnvVariable[] = [{name: "A", value: "B"}]; new SniptideClient("token").writeEnvGroup("test", v)',
  )
  execFileSync("node", ["index.mjs"], { cwd: temp, stdio: "inherit" })
  execFileSync(
    "tsc",
    [
      "--noEmit",
      "--strict",
      "--target",
      "es2022",
      "--module",
      "nodenext",
      "--moduleResolution",
      "nodenext",
      "index.ts",
    ],
    {
      cwd: temp,
      stdio: "inherit",
      env: { ...env, PATH: `${join(root, "node_modules/.bin")}:${process.env.PATH}` },
    },
  )
} finally {
  rmSync(temp, { recursive: true, force: true })
}
