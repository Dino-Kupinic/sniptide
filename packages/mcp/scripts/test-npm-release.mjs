import assert from "node:assert/strict"
import { execFile, execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { packRelease } from "../../../scripts/npm-release.mjs"

const execFileAsync = promisify(execFile)
const children = new Set()
const exec = async (file, args, options) => {
  const execution = execFileAsync(file, args, { timeout: 60_000, ...options })
  children.add(execution.child)
  try {
    return await execution
  } finally {
    children.delete(execution.child)
  }
}
const temp = await mkdtemp(path.join(tmpdir(), "sniptide-install-"))
const token = "snpt_12345678901"
let client
let server
let cleanupPromise
function cleanup() {
  cleanupPromise ??= (async () => {
    for (const child of children) child.kill()
    try {
      await client?.close()
    } finally {
      try {
        if (server) {
          server.closeAllConnections()
          await new Promise((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          )
        }
      } finally {
        await rm(temp, { recursive: true, force: true })
      }
    }
  })()
  return cleanupPromise
}
for (const [signal, code] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
]) {
  process.once(signal, () => {
    cleanup().finally(() => process.exit(code))
  })
}
try {
  const selected = process.argv[2]
  if (selected && !["cli", "mcp"].includes(selected)) throw new Error("Unknown product")
  const output = process.argv[3] ? path.resolve(process.argv[3]) : path.join(temp, "artifacts")
  const artifact = async (product) =>
    process.argv[3]
      ? JSON.parse(await readFile(path.join(output, `${product}.json`)))
      : packRelease(product, output)
  const cli = !selected || selected === "cli" ? await artifact("cli") : undefined
  const mcp = !selected || selected === "mcp" ? await artifact("mcp") : undefined
  for (const item of [cli, mcp].filter(Boolean)) {
    const bytes = await readFile(item.tarball)
    assert.equal(`sha512-${createHash("sha512").update(bytes).digest("base64")}`, item.integrity)
    const files = execFileSync("tar", ["-tzf", item.tarball], { encoding: "utf8" })
      .trim()
      .split("\n")
      .sort()
    assert.deepEqual(
      files,
      [
        "package/LICENSE",
        "package/README.md",
        `package/dist/${item.product === "cli" ? "sniptide" : "sniptide-mcp"}.js`,
        "package/package.json",
        ...(item.product === "mcp" ? ["package/server.json"] : []),
      ].sort(),
    )
  }
  const install = path.join(temp, "install")
  await mkdir(install)
  await writeFile(path.join(install, "package.json"), '{"private":true}\n')
  await exec(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      ...[cli, mcp].filter(Boolean).map((item) => item.tarball),
    ],
    { cwd: install, env: { ...process.env, npm_config_cache: path.join(temp, "cache") } },
  )
  const requests = []
  server = createServer((req, res) => {
    requests.push({ auth: req.headers.authorization, url: req.url })
    res.writeHead(200, { "content-type": "application/json" })
    res.end(JSON.stringify({ pastes: [], nextCursor: null }))
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const env = {
    ...process.env,
    SNIPTIDE_TOKEN: token,
    SNIPTIDE_BASE_URL: base,
    SNIPTIDE_CONFIG: path.join(temp, "config.json"),
  }
  if (cli) {
    const cliBin = path.join(install, "node_modules/.bin/sniptide")
    assert.match((await exec(cliBin, ["--help"], { cwd: install, env })).stdout, /sniptide search/)
    assert.equal(
      (await exec(cliBin, ["--version"], { cwd: install, env })).stdout.trim(),
      cli.version,
    )
    const search = JSON.parse(
      (await exec(cliBin, ["search", "button", "--json"], { cwd: install, env })).stdout,
    )
    assert.deepEqual(search, { ok: true, data: { pastes: [], nextCursor: null } })
  }
  if (mcp) {
    const mcpBin = path.join(install, "node_modules/.bin/sniptide-mcp")
    client = new Client({ name: "packed-smoke", version: "1.0.0" })
    const transport = new StdioClientTransport({
      command: mcpBin,
      cwd: install,
      env,
      stderr: "pipe",
    })
    await client.connect(transport)
    assert.equal(client.getServerVersion().version, mcp.version)
    const names = (await client.listTools()).tools.map((tool) => tool.name).sort()
    assert.deepEqual(names, [
      "create_collection",
      "create_snippet",
      "fetch_collection",
      "list_collections",
      "read_snippet",
      "search_snippets",
      "trash_snippet",
      "update_snippet",
      "update_snippet_settings",
    ])
    assert.deepEqual(
      (await client.listPrompts()).prompts.map((prompt) => prompt.name),
      ["use_snippet", "save_snippet", "apply_collection"],
    )
    const invalid = await client.callTool({ name: "search_snippets", arguments: { limit: -1 } })
    assert.equal(invalid.isError, true)
    const result = await client.callTool({
      name: "search_snippets",
      arguments: { query: "button" },
    })
    assert.equal(result.isError, undefined)
    assert.deepEqual(result.structuredContent, { pastes: [], nextCursor: null })
    assert.equal(requests.length, cli ? 2 : 1)
    await client.close()
    client = undefined
    await assert.rejects(
      exec(mcpBin, [], { cwd: install, env: { ...env, SNIPTIDE_TOKEN: "" } }),
      (error) => /SNIPTIDE_TOKEN/.test(error.stderr),
    )
  } else assert.equal(requests.length, 1)
  for (const request of requests) {
    assert.equal(request.auth, `Bearer ${token}`)
    assert.match(request.url, /^\/api\/v1\/pastes\?/)
  }
  for (const artifact of [cli, mcp].filter(Boolean)) {
    const manifest = JSON.parse(
      await readFile(path.join(install, "node_modules", artifact.name, "package.json")),
    )
    assert.equal(manifest.name, artifact.name)
    assert.equal(manifest.version, artifact.version)
    assert.deepEqual(manifest.bin, {
      [artifact.product === "cli" ? "sniptide" : "sniptide-mcp"]:
        `dist/${artifact.product === "cli" ? "sniptide" : "sniptide-mcp"}.js`,
    })
    assert.deepEqual(
      Object.keys(manifest.dependencies ?? {}).sort(),
      artifact.product === "cli" ? [] : ["@modelcontextprotocol/sdk", "zod"],
    )
    for (const value of Object.values(manifest.dependencies ?? {}))
      assert.doesNotMatch(value, /^(workspace|catalog):/)
    assert.deepEqual(manifest.exports, {})
    assert.equal(manifest.private, undefined)
    assert.equal(manifest.devDependencies, undefined)
  }
  console.log("Packed CLI and MCP installation smoke passed")
} finally {
  await cleanup()
}
