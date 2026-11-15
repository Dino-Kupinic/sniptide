import { watch } from "node:fs"
import { cp, mkdir, rm } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import tailwind from "@tailwindcss/postcss"
import postcss from "postcss"

// Builds the unpacked extension into dist/: the service worker, the popup, the compiled Tailwind
// theme, the fonts and the manifest. Load dist/ in chrome://extensions, or zip it for the store.
// `--watch` rebuilds when a source file changes.

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const dist = join(root, "dist")
const modules = join(root, "node_modules")
const ui = join(root, "../../packages/ui/src")

const fonts = [
  [join(modules, "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2"), "inter.woff2"],
  [
    join(modules, "@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2"),
    "inter-ext.woff2",
  ],
  [
    join(modules, "@fontsource-variable/archivo/files/archivo-latin-wght-normal.woff2"),
    "archivo.woff2",
  ],
  [join(ui, "fonts/PaperMono[wght].ttf"), "paper-mono.ttf"],
] as const

// Compiles the popup's Tailwind theme with the same PostCSS plugin the app and the docs use.
async function buildStyles() {
  const from = join(root, "src/popup/popup.css")
  const to = join(dist, "popup.css")
  const plugin = tailwind({ optimize: { minify: true } })
  const result = await postcss([plugin]).process(await Bun.file(from).text(), { from, to })
  await Bun.write(to, result.css)
}

async function build() {
  await rm(dist, { recursive: true, force: true })
  await mkdir(join(dist, "fonts"), { recursive: true })

  const result = await Bun.build({
    entrypoints: [join(root, "src/background.ts"), join(root, "src/popup/main.tsx")],
    outdir: dist,
    naming: { entry: "[name].js" },
    target: "browser",
    format: "esm",
    minify: true,
    define: { "process.env.NODE_ENV": '"production"' },
  })
  if (!result.success) throw new AggregateError(result.logs, "The extension didn't bundle.")
  // Bun names an entry after its file; the popup's page asks for popup.js.
  await Bun.write(join(dist, "popup.js"), Bun.file(join(dist, "main.js")))
  await rm(join(dist, "main.js"))

  await buildStyles()

  await cp(join(root, "public"), dist, { recursive: true })
  await cp(join(root, "src/popup/popup.html"), join(dist, "popup.html"))
  for (const [from, name] of fonts) await cp(from, join(dist, "fonts", name))

  // The manifest takes its version from package.json, so a release changes one number.
  const manifest = await Bun.file(join(root, "manifest.json")).json()
  const { version } = await Bun.file(join(root, "package.json")).json()
  await Bun.write(join(dist, "manifest.json"), JSON.stringify({ ...manifest, version }, null, 2))
}

await build()
console.log("Built apps/extension/dist")

if (process.argv.includes("--watch")) {
  let queued: ReturnType<typeof setTimeout> | undefined
  const rebuild = () => {
    clearTimeout(queued)
    queued = setTimeout(() => {
      build().then(
        () => console.log("Rebuilt apps/extension/dist"),
        (error) => console.error(error),
      )
    }, 100)
  }
  for (const path of ["src", "public", "manifest.json"])
    watch(join(root, path), { recursive: true }, rebuild)
}
