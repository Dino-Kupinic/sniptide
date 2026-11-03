import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { packRelease } from "./npm-release.mjs"
import { reconcileRegistryVersions } from "./reconcile-mcp-registry.mjs"
import { verifyRegistryVersion } from "./verify-mcp-registry.mjs"

const canonicalName = "io.github.Dino-Kupinic/sniptide"
const legacyName = "io.github.dino-kupinic/sniptide"
const legacyIntegrity =
  "sha512-ZNz9kITO3oHv0ox3tXXxPJuAkkTupcLr+TV4o/1pIAdWd9qRugf5/bizggF7ymQAd2kxepmoAe2Q+qhVHxuo2w=="
const temp = await mkdtemp(path.join(tmpdir(), "sniptide-gates-"))
const response = (body, status = 200) =>
  new Response(body === null ? null : JSON.stringify(body), { status })
const unpack = (tarball, file) =>
  JSON.parse(execFileSync("tar", ["-xOzf", tarball, `package/${file}`], { encoding: "utf8" }))
let serial = 0
try {
  const artifact = await packRelease("mcp", temp, { version: "0.1.1" })
  const bytes = await readFile(artifact.tarball)
  const manifest = unpack(artifact.tarball, "package.json")
  const metadata = unpack(artifact.tarball, "server.json")
  const fixture = (manifest, bytes, integrity) => ({
    npm: { ...manifest, dist: { tarball: `https://fixture/${manifest.version}`, integrity } },
    bytes,
  })
  const canonical = fixture(manifest, bytes, artifact.integrity)
  const forge = async (manifest, metadata) => {
    const directory = path.join(temp, `forged-${serial++}`)
    await mkdir(path.join(directory, "package"), { recursive: true })
    await writeFile(path.join(directory, "package/package.json"), JSON.stringify(manifest))
    await writeFile(path.join(directory, "package/server.json"), JSON.stringify(metadata))
    const tarball = `${directory}.tgz`
    execFileSync("tar", ["-czf", tarball, "-C", directory, "package"])
    const bytes = await readFile(tarball)
    return fixture(manifest, bytes, `sha512-${createHash("sha512").update(bytes).digest("base64")}`)
  }
  const requests =
    (fixtures, registry = () => response(null, 404), calls = []) =>
    async (url) => {
      calls.push(url)
      if (url === "https://registry.npmjs.org/%40sniptide%2Fmcp")
        return response({
          name: "@sniptide/mcp",
          versions: Object.fromEntries(fixtures.map((item) => [item.npm.version, item.npm])),
        })
      const item = fixtures.find(
        (item) => url === item.npm.dist?.tarball || url.endsWith(`/${item.npm.version}`),
      )
      if (url.startsWith("https://registry.npmjs.org/"))
        return response(item?.npm ?? null, item ? 200 : 404)
      if (url.startsWith("https://fixture/")) return new Response(item.bytes)
      return registry(url)
    }
  const target = path.join(temp, "server.json")
  const verify = (item, options = {}) =>
    verifyRegistryVersion(item.npm.version, target, { request: requests([item]), ...options })
  const runCli = async (script, args, version, request) => {
    const original = {
      argv: process.argv,
      fetch: globalThis.fetch,
      version: process.env.VERSION,
      output: process.env.GITHUB_OUTPUT,
    }
    const output = path.join(temp, `cli-output-${serial++}`)
    try {
      process.argv = [process.execPath, fileURLToPath(new URL(script, import.meta.url)), ...args]
      globalThis.fetch = request
      process.env.VERSION = version
      process.env.GITHUB_OUTPUT = output
      await import(`./${script}?test=${serial++}`)
      return readFile(output, "utf8")
    } finally {
      process.argv = original.argv
      globalThis.fetch = original.fetch
      if (original.version === undefined) delete process.env.VERSION
      else process.env.VERSION = original.version
      if (original.output === undefined) delete process.env.GITHUB_OUTPUT
      else process.env.GITHUB_OUTPUT = original.output
    }
  }

  await test("packed MCP identity matches the case-sensitive GitHub namespace", () => {
    assert.equal(manifest.mcpName, canonicalName)
    assert.equal(metadata.name, canonicalName)
  })
  await test("canonical artifacts are pending or exactly published", async () => {
    const calls = []
    assert.deepEqual(
      await verify(canonical, { request: requests([canonical], undefined, calls) }),
      { status: "pending" },
    )
    assert.deepEqual(JSON.parse(await readFile(target, "utf8")), metadata)
    assert.ok(
      calls.includes(
        `https://registry.modelcontextprotocol.io/v0.1/servers/${encodeURIComponent(canonicalName)}/versions/0.1.1`,
      ),
    )
    const stored = JSON.parse(
      JSON.stringify(metadata, (key, value) =>
        ["isRequired", "isSecret"].includes(key) && value === false ? undefined : value,
      ),
    )
    assert.deepEqual(
      await verify(canonical, {
        request: requests([canonical], () => response({ server: stored })),
      }),
      { status: "published" },
    )
    await assert.rejects(
      verify(canonical, {
        request: requests([canonical], () =>
          response({ server: { ...metadata, description: "wrong" } }),
        ),
      }),
      /mismatched/,
    )
    await assert.rejects(
      verify(canonical, { request: requests([canonical], () => response({})) }),
      /mismatched/,
    )
    await assert.rejects(
      verify(canonical, { request: requests([canonical], () => response({}, 500)) }),
      /Registry lookup failed/,
    )
  })
  await test("malformed npm metadata and corrupt or inconsistent tarballs fail closed", async () => {
    await assert.rejects(
      verify(canonical, { request: async () => response(null, 404) }),
      /Public npm package lookup failed/,
    )
    await assert.rejects(
      verify(canonical, { request: async () => new Response("null") }),
      /Invalid npm package metadata/,
    )
    await assert.rejects(
      verify(canonical, {
        request: async (url) =>
          url.includes("registry.npmjs.org") ? response(canonical.npm) : response(null, 500),
      }),
      /npm tarball download failed/,
    )
    for (const npm of [
      { ...canonical.npm, mcpName: "wrong" },
      { ...canonical.npm, name: "wrong" },
      { ...canonical.npm, dist: null },
    ])
      await assert.rejects(verify({ ...canonical, npm }), /Invalid npm package metadata/)
    await assert.rejects(verify({ ...canonical, bytes: Buffer.from("bad") }), /integrity mismatch/)
    const forged = await forge({ ...manifest, version: "9.9.9" }, metadata)
    await assert.rejects(
      verify({ ...forged, npm: { ...forged.npm, version: "0.1.1" } }),
      /Tarball metadata identity mismatch/,
    )
    await assert.rejects(
      verify(await forge(manifest, { ...metadata, name: legacyName })),
      /Tarball metadata identity mismatch/,
    )
    await assert.rejects(
      verify(await forge({ ...manifest, mcpName: legacyName }, { ...metadata, name: legacyName }), {
        allowKnownLegacy: true,
      }),
      /Invalid npm package metadata/,
    )
    await assert.rejects(verifyRegistryVersion("0.1.1-beta", target), /Invalid stable version/)
    await assert.rejects(readFile(target), /ENOENT/)
  })
  await test("only the pinned legacy bytes may earn an automatic exclusion", async () => {
    const oldManifest = { ...manifest, version: "0.1.0", mcpName: legacyName }
    const oldMetadata = {
      ...metadata,
      name: legacyName,
      version: "0.1.0",
      packages: [{ ...metadata.packages[0], version: "0.1.0" }],
    }
    const forged = await forge(oldManifest, oldMetadata)
    await assert.rejects(verify(forged, { allowKnownLegacy: true }), /legacy.*integrity/i)
    await assert.rejects(
      verify(
        {
          ...forged,
          npm: { ...forged.npm, dist: { ...forged.npm.dist, integrity: legacyIntegrity } },
        },
        { allowKnownLegacy: true },
      ),
      /integrity mismatch/,
    )
    await assert.rejects(
      verify(await forge({ ...oldManifest, mcpName: "wrong" }, oldMetadata), {
        allowKnownLegacy: true,
      }),
      /Invalid npm package metadata/,
    )
    await assert.rejects(
      verify(await forge(oldManifest, { ...oldMetadata, name: "wrong" }), {
        allowKnownLegacy: true,
      }),
      /Tarball metadata identity mismatch/,
    )
  })
  await test("reconciliation verifies every version before writing a publish plan", async () => {
    const output = path.join(temp, "reconcile")
    const pending = await reconcileRegistryVersions(output, { request: requests([canonical]) })
    assert.deepEqual(pending, [path.join(output, "0.1.1")])
    assert.deepEqual(JSON.parse(await readFile(path.join(output, "pending.json"), "utf8")), pending)
    const invalid = await forge(
      { ...manifest, version: "0.1.2", mcpName: legacyName },
      { ...metadata, name: legacyName, version: "0.1.2" },
    )
    await assert.rejects(
      reconcileRegistryVersions(output, { request: requests([canonical, invalid]) }),
      /Invalid npm package metadata/,
    )
    await assert.rejects(readFile(path.join(output, "pending.json")), /ENOENT/)
  })
  await test("CLI preserves strict verification and GitHub output contracts", async () => {
    assert.equal(
      await runCli("verify-mcp-registry.mjs", [target], "0.1.1", requests([canonical])),
      "published=false\n",
    )
    assert.equal(
      await runCli(
        "verify-mcp-registry.mjs",
        [target],
        "0.1.1",
        requests([canonical], () => response({ server: metadata })),
      ),
      "published=true\n",
    )
    const output = path.join(temp, "cli-reconcile")
    assert.equal(
      await runCli("reconcile-mcp-registry.mjs", [output], "0.1.1", requests([canonical])),
      "pending=1\n",
    )
    assert.deepEqual(JSON.parse(await readFile(path.join(output, "pending.json"), "utf8")), [
      path.join(output, "0.1.1"),
    ])
    await assert.rejects(
      runCli("verify-mcp-registry.mjs", [target], "", requests([canonical])),
      /Invalid stable version/,
    )
  })
  await test("actual immutable legacy artifact is excluded only in automatic mode", {
    skip: !process.env.LEGACY_MCP_TARBALL,
  }, async () => {
    const tarball = process.env.LEGACY_MCP_TARBALL
    const legacy = fixture(
      unpack(tarball, "package.json"),
      await readFile(tarball),
      legacyIntegrity,
    )
    const calls = []
    await writeFile(target, "stale")
    const result = await verify(legacy, {
      allowKnownLegacy: true,
      request: requests([legacy], undefined, calls),
    })
    assert.equal(result.status, "legacy-incompatible")
    assert.match(
      result.reason,
      /0\.1\.0.*io\.github\.dino-kupinic.*io\.github\.Dino-Kupinic.*immutable.*newer/,
    )
    assert.ok(calls.every((url) => !url.includes("modelcontextprotocol")))
    await assert.rejects(readFile(target), /ENOENT/)
    await assert.rejects(verify(legacy), /immutable.*newer/)
    await assert.rejects(
      runCli("verify-mcp-registry.mjs", [target], "0.1.0", requests([legacy])),
      /immutable.*newer/,
    )
    const output = path.join(temp, "legacy-reconcile")
    const warnings = []
    const request = requests([legacy, canonical])
    assert.deepEqual(
      await reconcileRegistryVersions(output, {
        request,
        warn: (warning) => warnings.push(warning),
      }),
      [path.join(output, "0.1.1")],
    )
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /^::warning::.*@sniptide\/mcp.*0\.1\.0/)
    await assert.rejects(readFile(path.join(output, "0.1.0/server.json")), /ENOENT/)
    await assert.rejects(
      reconcileRegistryVersions(output, { version: "0.1.0", request }),
      /immutable.*newer/,
    )
    await assert.rejects(
      runCli("reconcile-mcp-registry.mjs", [output], "0.1.0", request),
      /immutable.*newer/,
    )
    await assert.rejects(readFile(path.join(output, "pending.json")), /ENOENT/)
    assert.deepEqual(
      await reconcileRegistryVersions(output, {
        request: requests([legacy, canonical], () => response({ server: metadata })),
        warn: () => {},
      }),
      [],
    )
    assert.deepEqual(
      await reconcileRegistryVersions(output, { request: requests([legacy]), warn: () => {} }),
      [],
    )
  })
} finally {
  await rm(temp, { recursive: true, force: true })
}
