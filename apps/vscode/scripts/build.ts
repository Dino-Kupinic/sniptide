import { watch } from "node:fs"
import { rm } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

// Bundles the extension into dist/extension.js, the one file the editor loads. The SDK and the
// OAuth flow are bundled in, and only the editor's own `vscode` module stays outside. `--watch`
// rebuilds when a source file changes.
//
// A release sets SNIPTIDE_POSTHOG_KEY, which turns on the two install and sign-in events. A build
// without it, such as a development build, sends nothing.

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const dist = join(root, "dist")

async function build() {
  await rm(dist, { recursive: true, force: true })
  const result = await Bun.build({
    entrypoints: [join(root, "src/extension.ts")],
    outdir: dist,
    target: "node",
    format: "cjs",
    external: ["vscode"],
    minify: true,
    define: {
      "process.env.SNIPTIDE_POSTHOG_KEY": JSON.stringify(process.env.SNIPTIDE_POSTHOG_KEY ?? ""),
    },
  })
  if (!result.success) throw new AggregateError(result.logs, "The extension didn't bundle.")
}

await build()
console.log("Built apps/vscode/dist")

if (process.argv.includes("--watch")) {
  let queued: ReturnType<typeof setTimeout> | undefined
  watch(join(root, "src"), { recursive: true }, () => {
    clearTimeout(queued)
    queued = setTimeout(() => {
      build().then(
        () => console.log("Rebuilt apps/vscode/dist"),
        (error) => console.error(error),
      )
    }, 100)
  })
}
