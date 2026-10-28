import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const folder = mkdtempSync(path.join(os.tmpdir(), "sniptide-admission-test-"))
const web = fileURLToPath(new URL("..", import.meta.url))
try {
  const bundle = path.join(folder, "admission.test.mjs")
  const build = spawnSync(
    "bun",
    [
      "build",
      "--target=node",
      "--conditions=react-server",
      `--outfile=${bundle}`,
      "./test/request-admission.node.ts",
    ],
    { cwd: web, stdio: "inherit" },
  )
  if (build.error) throw build.error
  if (build.status !== 0) process.exitCode = build.status ?? 1
  else {
    const result = spawnSync(process.execPath, ["--test", bundle], { stdio: "inherit" })
    if (result.error) throw result.error
    process.exitCode = result.status ?? 1
  }
} finally {
  rmSync(folder, { recursive: true, force: true })
}
