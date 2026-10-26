import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const products = {
  cli: { bin: "sniptide", bundled: ["@sniptide/contracts"], external: [] },
  mcp: {
    bin: "sniptide-mcp",
    bundled: ["@sniptide/contracts"],
    external: ["@modelcontextprotocol/sdk", "zod"],
  },
}
const json = async (file) => JSON.parse(await readFile(file, "utf8"))
export async function packRelease(product, output) {
  const spec = products[product]
  if (!spec) throw new Error(`Unknown product: ${product}`)
  const source = path.join(root, "packages", product)
  const pkg = await json(path.join(source, "package.json"))
  const catalog = (await json(path.join(root, "package.json"))).catalogs.runtime
  const allowed = [...spec.bundled, ...spec.external].sort()
  if (JSON.stringify(Object.keys(pkg.dependencies ?? {}).sort()) !== JSON.stringify(allowed))
    throw new Error(
      `${pkg.name} runtime dependencies must be accounted for in the release inventory`,
    )
  const dependencies = Object.fromEntries(
    spec.external.map((name) => {
      const value = pkg.dependencies[name]
      const resolved = value === "catalog:runtime" ? catalog[name] : value
      if (!resolved || /^(workspace|catalog):/.test(resolved))
        throw new Error(`Unresolved dependency ${name}`)
      return [name, resolved]
    }),
  )
  const stage = await mkdtemp(path.join(tmpdir(), "sniptide-pack-"))
  try {
    await mkdir(path.join(stage, "dist"))
    const binary = path.join(stage, "dist", `${spec.bin}.js`)
    execFileSync(
      "bun",
      [
        "build",
        path.join(source, "src/bin.ts"),
        "--target=node",
        `--outfile=${binary}`,
        ...spec.external.map((name) => `--external=${name}`),
      ],
      { cwd: root, stdio: "inherit" },
    )
    await chmod(binary, 0o755)
    const manifest = {
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      license: pkg.license,
      type: "module",
      repository: {
        type: "git",
        url: "https://github.com/Dino-Kupinic/sniptide.git",
        directory: `packages/${product}`,
      },
      engines: pkg.engines,
      bin: { [spec.bin]: `dist/${spec.bin}.js` },
      exports: {},
      files: ["dist", "README.md", "LICENSE", ...(product === "mcp" ? ["server.json"] : [])],
      ...(spec.external.length ? { dependencies } : {}),
      ...(product === "mcp" ? { mcpName: "io.github.dino-kupinic/sniptide" } : {}),
    }
    await writeFile(path.join(stage, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`)
    await copyFile(path.join(source, "README.md"), path.join(stage, "README.md"))
    await copyFile(path.join(root, "LICENSE"), path.join(stage, "LICENSE"))
    if (product === "mcp") {
      const metadata = await json(path.join(source, "server.template.json"))
      if (
        metadata.name !== manifest.mcpName ||
        metadata.packages.length !== 1 ||
        metadata.packages[0].identifier !== pkg.name
      )
        throw new Error("MCP metadata identity mismatch")
      const entry = metadata.packages[0]
      const token = entry.environmentVariables?.find((item) => item.name === "SNIPTIDE_TOKEN")
      const base = entry.environmentVariables?.find((item) => item.name === "SNIPTIDE_BASE_URL")
      const remote = metadata.remotes?.[0]
      const auth = remote?.headers?.find((item) => item.name === "Authorization")
      if (
        metadata.$schema !==
          "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json" ||
        entry.registryType !== "npm" ||
        entry.transport?.type !== "stdio" ||
        !token?.isRequired ||
        !token?.isSecret ||
        base?.isRequired ||
        base?.default !== "https://app.sniptide.com" ||
        metadata.remotes?.length !== 1 ||
        remote.type !== "streamable-http" ||
        remote.url !== "https://app.sniptide.com/api/mcp" ||
        !auth?.isRequired ||
        !auth?.isSecret ||
        auth.value !== "Bearer {token}" ||
        !auth.variables?.token?.isRequired ||
        !auth.variables?.token?.isSecret
      )
        throw new Error("MCP metadata transport or credentials mismatch")
      metadata.version = pkg.version
      entry.version = pkg.version
      await writeFile(path.join(stage, "server.json"), `${JSON.stringify(metadata, null, 2)}\n`)
    }
    await mkdir(output, { recursive: true })
    const result = JSON.parse(
      execFileSync("npm", ["pack", "--json", "--pack-destination", output], {
        cwd: stage,
        encoding: "utf8",
        env: { ...process.env, npm_config_cache: path.join(stage, "cache") },
      }),
    )[0]
    const tarball = path.join(output, result.filename)
    const integrity = `sha512-${createHash("sha512")
      .update(await readFile(tarball))
      .digest("base64")}`
    if (integrity !== result.integrity) throw new Error("npm pack integrity mismatch")
    const artifact = { product, name: pkg.name, version: pkg.version, tarball, integrity }
    await writeFile(path.join(output, `${product}.json`), `${JSON.stringify(artifact, null, 2)}\n`)
    return artifact
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const output = path.resolve(process.argv[3] ?? "artifacts/npm")
  console.log(JSON.stringify(await packRelease(process.argv[2], output), null, 2))
}
