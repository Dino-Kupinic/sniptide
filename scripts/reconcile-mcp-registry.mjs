import { execFileSync } from "node:child_process"
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { publicPackage, versionParts } from "./npm-registry.mjs"

const output = path.resolve(process.argv[2])
const publisher = process.argv[3]
const pendingFile = path.join(output, "pending.json")
if (publisher) {
  const pending = JSON.parse(await readFile(pendingFile, "utf8"))
  if (pending.length) {
    execFileSync(publisher, ["login", "github-oidc"], { cwd: output, stdio: "inherit" })
    for (const directory of pending)
      execFileSync(publisher, ["publish"], { cwd: directory, stdio: "inherit" })
  }
} else {
  const versions = process.env.VERSION
    ? [process.env.VERSION]
    : (await publicPackage("@sniptide/mcp")).versions
  const pending = []
  await mkdir(output, { recursive: true })
  for (const version of versions) {
    versionParts(version)
    const directory = path.join(output, version)
    await mkdir(directory, { recursive: true })
    const result = path.join(directory, "result")
    await writeFile(result, "")
    execFileSync(
      process.execPath,
      [
        fileURLToPath(new URL("./verify-mcp-registry.mjs", import.meta.url)),
        path.join(directory, "server.json"),
      ],
      { stdio: "inherit", env: { ...process.env, VERSION: version, GITHUB_OUTPUT: result } },
    )
    if ((await readFile(result, "utf8")).trim() === "published=false") pending.push(directory)
  }
  await writeFile(pendingFile, `${JSON.stringify(pending)}\n`)
  if (process.env.GITHUB_OUTPUT)
    await appendFile(process.env.GITHUB_OUTPUT, `pending=${pending.length}\n`)
  console.log(`${pending.length} published MCP versions need registry registration`)
}
