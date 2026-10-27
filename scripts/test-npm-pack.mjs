import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { packRelease } from "./npm-release.mjs"

await test("packing returns the exact npm tarball with verified integrity", async () => {
  const output = await mkdtemp(path.join(tmpdir(), "sniptide-pack-test-"))
  try {
    const artifact = await packRelease("ui", output, { commit: "a".repeat(40) })
    const manifest = JSON.parse(
      execFileSync("tar", ["-xOzf", artifact.tarball, "package/package.json"], {
        encoding: "utf8",
      }),
    )
    assert.equal(path.basename(artifact.tarball), `sniptide-ui-${artifact.version}.tgz`)
    assert.equal(manifest.name, artifact.name)
    assert.equal(manifest.version, artifact.version)
    assert.equal(manifest.gitHead, artifact.commit)
    assert.equal(
      artifact.integrity,
      `sha512-${createHash("sha512")
        .update(await readFile(artifact.tarball))
        .digest("base64")}`,
    )
    assert.deepEqual(JSON.parse(await readFile(path.join(output, "ui.json"), "utf8")), artifact)
  } finally {
    await rm(output, { recursive: true, force: true })
  }
})
