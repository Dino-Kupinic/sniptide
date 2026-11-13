import assert from "node:assert/strict"
import { cp, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { bumpPluginVersions, manifests } from "./bump-plugin-versions.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "sniptide-plugin-versions-"))
  for (const file of manifests) await cp(path.join(root, file), path.join(dir, file))
  return dir
}

test("writes the release version into every plugin manifest", async () => {
  const dir = await fixture()
  try {
    await bumpPluginVersions("1.2.3", dir)
    for (const file of manifests) {
      const before = await readFile(path.join(root, file), "utf8")
      const after = await readFile(path.join(dir, file), "utf8")
      assert.equal(JSON.parse(after).version, "1.2.3")
      // Only the version line changes, and nested objects keep their values.
      assert.deepEqual(
        { ...JSON.parse(after), version: null },
        { ...JSON.parse(before), version: null },
      )
      assert.equal(after.split("\n").length, before.split("\n").length)
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("rejects a value that is not a semantic version", async () => {
  const dir = await fixture()
  try {
    await assert.rejects(bumpPluginVersions("v1.2", dir), /semantic version/)
    await assert.rejects(bumpPluginVersions(undefined, dir), /semantic version/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
