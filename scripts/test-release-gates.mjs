import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { packRelease } from "./npm-release.mjs"

const temp = await mkdtemp(path.join(tmpdir(), "sniptide-gates-"))
const originalFetch = globalThis.fetch
const originalArgv = process.argv.slice()
const originalVersion = process.env.VERSION
const originalOutput = process.env.GITHUB_OUTPUT
let serial = 0
try {
  const artifact = await packRelease("mcp", temp)
  const bytes = await readFile(artifact.tarball)
  const manifest = JSON.parse(
    execFileSync("tar", ["-xOzf", artifact.tarball, "package/package.json"], { encoding: "utf8" }),
  )
  const metadata = JSON.parse(
    execFileSync("tar", ["-xOzf", artifact.tarball, "package/server.json"], { encoding: "utf8" }),
  )
  const npmMeta = {
    ...manifest,
    dist: { tarball: "https://fixture/tarball", integrity: artifact.integrity },
  }
  const output = path.join(temp, "output")
  const artifactFile = path.join(temp, "mcp.json")
  const run = async (script, args, fetch) => {
    globalThis.fetch = fetch
    process.argv = [originalArgv[0], script, ...args]
    await import(`./${script}?test=${serial++}`)
  }
  const response = (body, status = 200) =>
    new Response(body === null ? null : JSON.stringify(body), { status })
  await test("npm gate skips only a valid exact public version or accepts a 404", async () => {
    process.env.GITHUB_OUTPUT = output
    await writeFile(output, "")
    await run("check-npm-version.mjs", [artifactFile], async () => response(null, 404))
    assert.match(await readFile(output, "utf8"), /published=false/)
    await writeFile(output, "")
    await run("check-npm-version.mjs", [artifactFile], async () =>
      response({ name: artifact.name, version: artifact.version }),
    )
    assert.match(await readFile(output, "utf8"), /published=true/)
    for (const status of [401, 500])
      await assert.rejects(
        run("check-npm-version.mjs", [artifactFile], async () => response({}, status)),
        /lookup failed/,
      )
    await assert.rejects(
      run("check-npm-version.mjs", [artifactFile], async () =>
        response({ name: "wrong", version: artifact.version }),
      ),
      /identity/,
    )
  })
  await test("registry gate verifies public npm artifact and exact registry metadata", async () => {
    process.env.VERSION = artifact.version
    const target = path.join(temp, "server.json")
    const fetcher = (npm, tar, registry) => async (url) =>
      url.includes("registry.npmjs.org") ? npm : url === "https://fixture/tarball" ? tar : registry
    const tar = () => new Response(bytes)
    const invoke = (npm, body, registry) =>
      run("verify-mcp-registry.mjs", [target], fetcher(npm, body, registry))
    await rm(target, { force: true })
    await assert.rejects(
      invoke(response(null, 404), tar(), response(null, 404)),
      /Public npm package lookup failed/,
    )
    await assert.rejects(readFile(target), /ENOENT/)
    await assert.rejects(
      invoke(response(npmMeta), new Response("bad"), response(null, 404)),
      /integrity mismatch/,
    )
    await assert.rejects(
      invoke(response({ ...npmMeta, mcpName: "wrong" }), tar(), response(null, 404)),
      /metadata/,
    )
    const forged = path.join(temp, "forged")
    await mkdir(path.join(forged, "package"), { recursive: true })
    await writeFile(
      path.join(forged, "package/package.json"),
      JSON.stringify({ ...manifest, version: "9.9.9" }),
    )
    await writeFile(path.join(forged, "package/server.json"), JSON.stringify(metadata))
    const forgedTar = path.join(temp, "forged.tgz")
    execFileSync("tar", ["-czf", forgedTar, "-C", forged, "package"])
    const forgedBytes = await readFile(forgedTar)
    const forgedIntegrity = `sha512-${createHash("sha512").update(forgedBytes).digest("base64")}`
    await assert.rejects(
      invoke(
        response({ ...npmMeta, dist: { ...npmMeta.dist, integrity: forgedIntegrity } }),
        new Response(forgedBytes),
        response(null, 404),
      ),
      /Tarball metadata identity mismatch/,
    )
    await writeFile(output, "")
    await invoke(response(npmMeta), tar(), response(null, 404))
    assert.match(await readFile(output, "utf8"), /published=false/)
    await writeFile(output, "")
    const storedMetadata = JSON.parse(
      JSON.stringify(metadata, (key, value) =>
        ["isRequired", "isSecret"].includes(key) && value === false ? undefined : value,
      ),
    )
    await invoke(response(npmMeta), tar(), response({ server: storedMetadata }))
    assert.match(await readFile(output, "utf8"), /published=true/)
    await assert.rejects(
      invoke(response(npmMeta), tar(), response({ server: { ...metadata, description: "wrong" } })),
      /mismatched/,
    )
    await assert.rejects(
      invoke(response(npmMeta), tar(), response({}, 500)),
      /Registry lookup failed/,
    )
    await assert.rejects(invoke(response(npmMeta), tar(), response({})), /mismatched/)
  })
} finally {
  globalThis.fetch = originalFetch
  process.argv = originalArgv
  if (originalVersion === undefined) delete process.env.VERSION
  else process.env.VERSION = originalVersion
  if (originalOutput === undefined) delete process.env.GITHUB_OUTPUT
  else process.env.GITHUB_OUTPUT = originalOutput
  await rm(temp, { recursive: true, force: true })
}
