import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { versionParts } from "./npm-registry.mjs"

const { name } = JSON.parse(
  await readFile(new URL("../packages/mcp/server.template.json", import.meta.url), "utf8"),
)
const legacy = {
  version: "0.1.0",
  name: "io.github.dino-kupinic/sniptide",
  integrity:
    "sha512-ZNz9kITO3oHv0ox3tXXxPJuAkkTupcLr+TV4o/1pIAdWd9qRugf5/bizggF7ymQAd2kxepmoAe2Q+qhVHxuo2w==",
}

export async function verifyRegistryVersion(
  version,
  target,
  { request = fetch, allowKnownLegacy = false } = {},
) {
  versionParts(version)
  await rm(target, { force: true })
  const pkgResponse = await request(
    `https://registry.npmjs.org/%40sniptide%2Fmcp/${encodeURIComponent(version)}`,
  )
  if (!pkgResponse.ok)
    throw new Error(`Public npm package lookup failed: HTTP ${pkgResponse.status}`)
  const pkg = await pkgResponse.json()
  const legacyIdentity = version === legacy.version && pkg?.mcpName === legacy.name
  if (
    pkg?.name !== "@sniptide/mcp" ||
    pkg.version !== version ||
    (pkg.mcpName !== name && !legacyIdentity) ||
    typeof pkg.dist?.tarball !== "string" ||
    !pkg.dist.tarball ||
    typeof pkg.dist.integrity !== "string" ||
    !pkg.dist.integrity
  )
    throw new Error("Invalid npm package metadata")
  const tarResponse = await request(pkg.dist.tarball)
  if (!tarResponse.ok) throw new Error(`npm tarball download failed: HTTP ${tarResponse.status}`)
  const bytes = Buffer.from(await tarResponse.arrayBuffer())
  if (`sha512-${createHash("sha512").update(bytes).digest("base64")}` !== pkg.dist.integrity)
    throw new Error("npm integrity mismatch")
  const temp = await mkdtemp(path.join(tmpdir(), "sniptide-registry-"))
  try {
    const tarball = path.join(temp, "package.tgz")
    await writeFile(tarball, bytes)
    const manifest = JSON.parse(
      execFileSync("tar", ["-xOzf", tarball, "package/package.json"], { encoding: "utf8" }),
    )
    const metadata = JSON.parse(
      execFileSync("tar", ["-xOzf", tarball, "package/server.json"], { encoding: "utf8" }),
    )
    if (
      manifest.name !== pkg.name ||
      manifest.version !== version ||
      manifest.mcpName !== pkg.mcpName ||
      metadata.name !== pkg.mcpName ||
      metadata.version !== version ||
      metadata.packages?.length !== 1 ||
      metadata.packages[0].identifier !== pkg.name ||
      metadata.packages[0].version !== version
    )
      throw new Error("Tarball metadata identity mismatch")
    if (legacyIdentity) {
      if (pkg.dist.integrity !== legacy.integrity)
        throw new Error("Known legacy artifact integrity mismatch")
      const reason = `@sniptide/mcp ${version} uses ${legacy.name}. Registration requires ${name}. This npm version is immutable. Publish a newer corrected version.`
      if (!allowKnownLegacy) throw new Error(reason)
      return { status: "legacy-incompatible", reason }
    }
    const response = await request(
      `https://registry.modelcontextprotocol.io/v0.1/servers/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}`,
    )
    let status = "pending"
    if (response.status !== 404) {
      if (!response.ok) throw new Error(`Registry lookup failed: HTTP ${response.status}`)
      const existing = await response.json()
      const canonical = (value) =>
        JSON.stringify(value, (_key, item) =>
          item && typeof item === "object" && !Array.isArray(item)
            ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
            : item,
        )
      if (!existing?.server || canonical(existing.server) !== canonical(metadata))
        throw new Error("Registry version exists with mismatched metadata")
      status = "published"
    }
    await writeFile(target, `${JSON.stringify(metadata, null, 2)}\n`)
    return { status }
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await verifyRegistryVersion(process.env.VERSION, process.argv[2])
  if (process.env.GITHUB_OUTPUT)
    await appendFile(process.env.GITHUB_OUTPUT, `published=${result.status === "published"}\n`)
}
