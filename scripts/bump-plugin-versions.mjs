// Writes the release version into the agent plugin manifests that clients read straight from the
// repository. Claude Code and Gemini CLI only offer an update when the manifest version changes,
// so semantic-release runs this in its prepare step and commits the result with the release.
//
// Usage: node scripts/bump-plugin-versions.mjs <version>
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const manifests = ["gemini-extension.json", "plugins/claude/.claude-plugin/plugin.json"]

export async function bumpPluginVersions(version, root) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version ?? "")) {
    throw new Error(`Expected a semantic version, got "${version}"`)
  }
  for (const file of manifests) {
    const target = path.join(root, file)
    const text = await readFile(target, "utf8")
    // Replace only the top-level version so the rest of the file keeps its formatting.
    const next = text.replace(/^(\s{2}"version":\s*)"[^"]*"/m, `$1"${version}"`)
    if (next === text && !text.includes(`"version": "${version}"`)) {
      throw new Error(`${file} has no top-level "version" field`)
    }
    await writeFile(target, next)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  await bumpPluginVersions(process.argv[2], root)
}
