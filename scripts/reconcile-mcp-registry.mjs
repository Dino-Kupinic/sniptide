import { execFileSync } from "node:child_process"
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { publicPackage, versionParts } from "./npm-registry.mjs"
import { verifyRegistryVersion } from "./verify-mcp-registry.mjs"

export async function reconcileRegistryVersions(
  output,
  { version: requestedVersion, request = fetch, warn = console.warn } = {},
) {
  const pendingFile = path.join(output, "pending.json")
  await mkdir(output, { recursive: true })
  await rm(pendingFile, { force: true })
  const versions = requestedVersion
    ? [requestedVersion]
    : (await publicPackage("@sniptide/mcp", request)).versions
  const pending = []
  for (const version of versions) {
    versionParts(version)
    const directory = path.join(output, version)
    await mkdir(directory, { recursive: true })
    const result = await verifyRegistryVersion(version, path.join(directory, "server.json"), {
      request,
      allowKnownLegacy: !requestedVersion,
    })
    switch (result.status) {
      case "pending":
        pending.push(directory)
        break
      case "legacy-incompatible":
        warn(`::warning::${result.reason}`)
        break
      case "published":
        break
      default:
        throw new Error(`Unknown registry verification status: ${result.status}`)
    }
  }
  await writeFile(pendingFile, `${JSON.stringify(pending)}\n`)
  return pending
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const output = path.resolve(process.argv[2])
  const publisher = process.argv[3]
  if (publisher) {
    const pending = JSON.parse(await readFile(path.join(output, "pending.json"), "utf8"))
    if (pending.length) {
      execFileSync(publisher, ["login", "github-oidc"], { cwd: output, stdio: "inherit" })
      for (const directory of pending)
        execFileSync(publisher, ["publish"], { cwd: directory, stdio: "inherit" })
    }
  } else {
    const pending = await reconcileRegistryVersions(output, { version: process.env.VERSION })
    if (process.env.GITHUB_OUTPUT)
      await appendFile(process.env.GITHUB_OUTPUT, `pending=${pending.length}\n`)
    console.log(`${pending.length} published MCP versions need registry registration`)
  }
}
