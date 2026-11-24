// Writes lib/last-modified.json: the date each page in content/docs last changed, for the
// sitemap's <lastmod>. The Docker build has no Git history, so the dates are read here and
// committed. Run it after editing a page:
//   bun --filter docs last-modified
// A page with uncommitted changes gets today's date, so the file can go in the same commit.
import { readdirSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"

const docsDir = join(import.meta.dir, "..")
const contentDir = join(docsDir, "content", "docs")
const outFile = join(docsDir, "lib", "last-modified.json")

function mdxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return mdxFiles(path)
    return entry.name.endsWith(".mdx") ? [path] : []
  })
}

function git(...args: string[]) {
  const result = Bun.spawnSync(["git", ...args], { cwd: docsDir })
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`)
  return result.stdout.toString().trim()
}

if (git("rev-parse", "--is-shallow-repository") === "true") {
  throw new Error("This clone is shallow, so its dates would be wrong. Run git fetch --unshallow.")
}

const today = new Date().toISOString().slice(0, 10)
const dates: Record<string, string> = {}
for (const file of mdxFiles(contentDir).sort()) {
  const changed = git("status", "--porcelain", "--", file) !== ""
  dates[relative(contentDir, file)] = changed ? today : git("log", "-1", "--format=%cs", "--", file)
}
writeFileSync(outFile, `${JSON.stringify(dates, null, 2)}\n`)
console.log(`Dated ${Object.keys(dates).length} pages in ${relative(docsDir, outFile)}.`)
