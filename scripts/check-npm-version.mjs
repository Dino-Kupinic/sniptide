import { appendFile, readFile } from "node:fs/promises"

const artifact = JSON.parse(await readFile(process.argv[2], "utf8"))
const response = await fetch(
  `https://registry.npmjs.org/${encodeURIComponent(artifact.name)}/${encodeURIComponent(artifact.version)}`,
)
if (response.status !== 404 && !response.ok)
  throw new Error(`npm lookup failed: HTTP ${response.status}`)
if (response.ok) {
  const data = await response.json()
  if (data.name !== artifact.name || data.version !== artifact.version)
    throw new Error("npm returned mismatched package identity")
}
const published = response.ok
console.log(`${artifact.name}@${artifact.version} ${published ? "already public" : "not public"}`)
if (process.env.GITHUB_OUTPUT)
  await appendFile(process.env.GITHUB_OUTPUT, `published=${published}\n`)
