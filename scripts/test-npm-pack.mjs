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
    assert.equal(manifest.homepage, "https://sniptide.com")
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

await test("release tarballs carry their package licenses and bundled notices", async () => {
  const output = await mkdtemp(path.join(tmpdir(), "sniptide-license-test-"))
  try {
    for (const [product, license] of [
      ["ui", "AGPL-3.0-only"],
      ["cli", "MIT"],
      ["mcp", "MIT"],
    ]) {
      const artifact = await packRelease(product, output, { commit: "a".repeat(40) })
      const read = (file) =>
        execFileSync("tar", ["-xOzf", artifact.tarball, `package/${file}`], { encoding: "utf8" })
      assert.equal(JSON.parse(read("package.json")).license, license)
      const text = read("LICENSE")
      if (license === "MIT") {
        assert.match(text, /^MIT License\n/)
        assert.match(text, /Copyright \(c\) 2026 Dino Kupinic/)
        assert.match(text, /Permission is hereby granted, free of charge/)
      } else assert.match(text, /GNU AFFERO GENERAL PUBLIC LICENSE/)
      if (product === "cli") {
        const notice = read("THIRD_PARTY_NOTICES")
        assert.match(notice, /Zod, bundled through @sniptide\/contracts/)
        assert.match(notice, /Copyright \(c\) 2025 Colin McDonnell/)
        const zodLicense = await readFile(
          new URL("../packages/contracts/node_modules/zod/LICENSE", import.meta.url),
          "utf8",
        )
        assert.equal(
          notice,
          `Zod, bundled through @sniptide/contracts\nhttps://github.com/colinhacks/zod\n\n${zodLicense}`,
        )
      }
    }
  } finally {
    await rm(output, { recursive: true, force: true })
  }
})
