import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"

const exec = promisify(execFile)
const artifact = JSON.parse(await readFile(path.join(process.argv[2], "ui.json"), "utf8"))
const bytes = await readFile(artifact.tarball)
assert.equal(`sha512-${createHash("sha512").update(bytes).digest("base64")}`, artifact.integrity)
const temp = await mkdtemp(path.join(tmpdir(), "sniptide-ui-install-"))
try {
  const consumer = path.join(temp, "consumer")
  await mkdir(consumer)
  await writeFile(path.join(consumer, "package.json"), '{"private":true,"type":"module"}\n')
  const options = {
    cwd: consumer,
    timeout: 180_000,
    env: { ...process.env, npm_config_cache: path.join(temp, "cache") },
  }
  await exec(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      artifact.tarball,
      "react@19.3.1",
      "react-dom@19.3.1",
      "typescript@5.9.3",
      "@types/react@19",
      "@types/react-dom@19",
      "postcss@8",
    ],
    options,
  )
  const installed = path.join(consumer, "node_modules/@sniptide/ui")
  const manifest = JSON.parse(await readFile(path.join(installed, "package.json"), "utf8"))
  assert.equal(manifest.version, artifact.version)
  for (const value of Object.values(manifest.dependencies))
    assert.doesNotMatch(value, /^(catalog|workspace):/)
  const components = (await readdir(path.join(installed, "src/components"))).filter((name) =>
    name.endsWith(".tsx"),
  )
  await writeFile(
    path.join(consumer, "check.tsx"),
    components
      .map(
        (name, i) =>
          `import * as component${i} from "@sniptide/ui/components/${name.slice(0, -4)}"; void component${i};`,
      )
      .join("\n"),
  )
  await writeFile(
    path.join(consumer, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        jsx: "react-jsx",
        strict: true,
        skipLibCheck: true,
        noEmit: true,
      },
      include: ["check.tsx"],
    }),
  )
  await exec(path.join(consumer, "node_modules/.bin/tsc"), [], options)
  await writeFile(
    path.join(consumer, "render.tsx"),
    `import { renderToStaticMarkup } from "react-dom/server"
import { Button } from "@sniptide/ui/components/button"
console.log(renderToStaticMarkup(<Button>Package consumer</Button>))`,
  )
  await exec(
    "bun",
    [
      "build",
      "render.tsx",
      "--target=node",
      "--external=react",
      "--external=react-dom/server",
      "--outfile=render.mjs",
    ],
    options,
  )
  assert.match((await exec("node", ["render.mjs"], options)).stdout, /Package consumer/)
  await writeFile(
    path.join(consumer, "styles.mjs"),
    `import postcss from "postcss"
import tailwindcss from "@tailwindcss/postcss"
import { createRequire } from "node:module"
import { readFile } from "node:fs/promises"
const require = createRequire(import.meta.url)
const file = require.resolve("@sniptide/ui/globals.css")
const result = await postcss([tailwindcss({ base: process.cwd() })]).process(await readFile(file, "utf8"), { from: file })
if (!result.css.includes("--primary:") || !result.css.includes("--pink:")) throw new Error("Package theme is missing")
console.log("Theme compiled")
`,
  )
  await exec("node", ["styles.mjs"], options)
  assert.ok((await readFile(path.join(installed, "src/fonts/PaperMono-Regular.ttf"))).length)
  console.log(`UI package consumer passed with ${components.length} component modules`)
} finally {
  await rm(temp, { recursive: true, force: true })
}
