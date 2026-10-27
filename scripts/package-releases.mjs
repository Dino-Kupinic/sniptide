import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { list } from "tar"
import { publicPackage, responseJson, versionParts } from "./npm-registry.mjs"
import { packRelease, products } from "./npm-release.mjs"

export { publicPackage } from "./npm-registry.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim()
export function bumpVersion(version, messages) {
  const parts = versionParts(version)
  const major = messages.some(
    (message) =>
      /^[a-z][a-z0-9-]*(?:\([^\n)]+\))?!:/.test(message) || /^BREAKING[ -]CHANGE:/m.test(message),
  )
  const minor = messages.some((message) => /^feat(?:\([^\n)]+\))?:/.test(message))
  return major
    ? `${parts[0] + 1}.0.0`
    : minor
      ? `${parts[0]}.${parts[1] + 1}.0`
      : `${parts[0]}.${parts[1]}.${parts[2] + 1}`
}
function canonical(value) {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  )
}
export async function fingerprint(tarball) {
  const files = []
  await list({
    file: tarball,
    onReadEntry(entry) {
      if (entry.type === "Directory") {
        entry.resume()
        return
      }
      if (entry.type !== "File" && entry.type !== "OldFile")
        throw new Error("Unsupported package archive entry")
      const chunks = []
      files.push({ name: entry.path, chunks })
      entry.on("data", (chunk) => chunks.push(chunk))
    },
  })
  files.sort((a, b) => a.name.localeCompare(b.name))
  if (new Set(files.map((file) => file.name)).size !== files.length)
    throw new Error("Duplicate package archive entries")
  const hash = createHash("sha256")
  for (const { name, chunks } of files) {
    if (!name.startsWith("package/") || name.split("/").includes(".."))
      throw new Error(`Invalid package archive path: ${name}`)
    let bytes = Buffer.concat(chunks)
    if (name === "package/package.json") {
      const manifest = JSON.parse(bytes)
      delete manifest.gitHead
      bytes = Buffer.from(canonical(manifest))
    }
    hash.update(canonical([name, bytes.length])).update(bytes)
  }
  return hash.digest("hex")
}
export async function downloadPackage(manifest, target, request = fetch) {
  if (!manifest.dist?.tarball || !manifest.dist?.integrity) throw new Error("Missing npm artifact")
  const response = await request(manifest.dist.tarball, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`Tarball download failed: HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (`sha512-${createHash("sha512").update(bytes).digest("base64")}` !== manifest.dist.integrity)
    throw new Error("Public npm artifact integrity mismatch")
  await writeFile(target, bytes)
}
function messagesSince(product, current, commit) {
  const spec = products[product]
  const baseline =
    current.gitHead ?? (current.version === spec.baseline.version ? spec.baseline.commit : null)
  if (!baseline || !/^[a-f0-9]{40}$/.test(baseline))
    throw new Error("Published package has no verified source baseline")
  try {
    git("cat-file", "-e", `${baseline}^{commit}`)
  } catch {
    git("fetch", "origin", baseline)
  }
  const log = git("log", "--format=%B%x00", `${baseline}..${commit}`, "--", ...spec.paths)
  return log
    .split("\0")
    .map((message) => message.trim())
    .filter(Boolean)
}
export async function planRelease(product, output, options = {}) {
  const spec = products[product]
  if (!spec) throw new Error("Unknown public package")
  const request = options.request ?? fetch
  const commit = options.commit ?? git("rev-parse", "HEAD")
  const { current, versions } = await publicPackage(spec.name, request)
  await mkdir(output, { recursive: true })
  if (!current) {
    return {
      changed: true,
      artifact: await packRelease(product, output, { version: spec.baseline.version, commit }),
      versions,
    }
  }
  if (current.name !== spec.name) throw new Error("Published package identity mismatch")
  const previous = path.join(output, "previous.tgz")
  await downloadPackage(current, previous, request)
  const candidate = await packRelease(product, output, { version: current.version, commit })
  if ((await fingerprint(previous)) === (await fingerprint(candidate.tarball)))
    return { changed: false, artifact: candidate, versions }
  const messages = options.messages ?? messagesSince(product, current, commit)
  const version = bumpVersion(current.version, messages)
  return {
    changed: true,
    artifact: await packRelease(product, output, { version, commit }),
    versions,
  }
}
export async function publishExactArtifact(artifact, options = {}) {
  const bytes = await readFile(artifact.tarball)
  if (`sha512-${createHash("sha512").update(bytes).digest("base64")}` !== artifact.integrity)
    throw new Error("Tested tarball changed before publication")
  const request = options.request ?? fetch
  const url = `https://registry.npmjs.org/${encodeURIComponent(artifact.name)}/${artifact.version}`
  const matches = (value) => {
    if (
      value.name !== artifact.name ||
      value.version !== artifact.version ||
      value.dist?.integrity !== artifact.integrity
    )
      throw new Error("Published version conflicts with the tested artifact")
  }
  const existing = await responseJson(url, request)
  if (existing) {
    matches(existing)
    return
  }
  let failure
  try {
    if (options.publish) await options.publish(artifact)
    else
      execFileSync(
        "npm",
        [
          "publish",
          artifact.tarball,
          "--access",
          "public",
          "--provenance",
          "--registry=https://registry.npmjs.org",
        ],
        { stdio: "inherit" },
      )
  } catch (error) {
    failure = error
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    const value = await responseJson(url, request)
    if (value) {
      matches(value)
      return
    }
    if (failure) throw failure
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error("npm did not expose the published artifact")
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const product = process.argv[2]
  const output = path.resolve(process.argv[3] ?? `artifacts/npm/${product}`)
  const commit = git("rev-parse", "HEAD")
  if (process.env.RELEASE_SHA && process.env.RELEASE_SHA !== commit)
    throw new Error("Checkout does not match tested release SHA")
  const plan = await planRelease(product, output, { commit })
  await writeFile(path.join(output, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`)
  console.log(
    `${plan.artifact.name}: ${plan.changed ? "release" : "unchanged"} ${plan.artifact.version}`,
  )
  if (process.env.GITHUB_OUTPUT)
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `changed=${plan.changed}\nversion=${plan.artifact.version}\n`,
    )
}
