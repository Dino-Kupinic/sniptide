import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

const version = process.env.VERSION
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))
  throw new Error("A valid exact version is required")
const name = "io.github.dino-kupinic/sniptide"
const pkgResponse = await fetch(
  `https://registry.npmjs.org/%40sniptide%2Fmcp/${encodeURIComponent(version)}`,
)
if (!pkgResponse.ok) throw new Error(`Public npm package lookup failed: HTTP ${pkgResponse.status}`)
const pkg = await pkgResponse.json()
if (
  pkg.name !== "@sniptide/mcp" ||
  pkg.version !== version ||
  pkg.mcpName !== name ||
  !pkg.dist?.tarball ||
  !pkg.dist?.integrity
)
  throw new Error("Invalid npm package metadata")
const tarResponse = await fetch(pkg.dist.tarball)
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
    manifest.mcpName !== name ||
    metadata.name !== name ||
    metadata.version !== version ||
    metadata.packages?.length !== 1 ||
    metadata.packages[0].identifier !== pkg.name ||
    metadata.packages[0].version !== version
  )
    throw new Error("Tarball metadata identity mismatch")
  const response = await fetch(
    `https://registry.modelcontextprotocol.io/v0.1/servers/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}`,
  )
  let published = false
  if (response.status !== 404) {
    if (!response.ok) throw new Error(`Registry lookup failed: HTTP ${response.status}`)
    const existing = await response.json()
    const canonical = (value) =>
      JSON.stringify(value, (_key, item) =>
        item && typeof item === "object" && !Array.isArray(item)
          ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
          : item,
      )
    if (!existing.server || canonical(existing.server) !== canonical(metadata))
      throw new Error("Registry version exists with mismatched metadata")
    published = true
  }
  await writeFile(process.argv[2], `${JSON.stringify(metadata, null, 2)}\n`)
  if (process.env.GITHUB_OUTPUT)
    await appendFile(process.env.GITHUB_OUTPUT, `published=${published}\n`)
} finally {
  await rm(temp, { recursive: true, force: true })
}
