import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { create, extract } from "tar"
import { packRelease } from "./npm-release.mjs"
import {
  bumpVersion,
  fingerprint,
  planRelease,
  publicPackage,
  publishExactArtifact,
} from "./package-releases.mjs"

await test("independent versions follow Conventional Commits", () => {
  assert.equal(bumpVersion("0.1.1", ["fix(ui): fix focus"]), "0.1.2")
  assert.equal(bumpVersion("0.1.1", ["feat(ui): add spinner"]), "0.2.0")
  assert.equal(bumpVersion("0.1.1", ["fix(ui)!: change props"]), "1.0.0")
  assert.equal(
    bumpVersion("1.2.3", ["feat(ui): update\n\nBREAKING CHANGE: remove a prop"]),
    "2.0.0",
  )
  assert.equal(bumpVersion("1.2.3", []), "1.2.4")
  assert.throws(() => bumpVersion("0.1.1-beta.1", []), /stable version/)
})
await test("package metadata lookups fail closed and choose the highest stable version", async () => {
  assert.deepEqual(
    await publicPackage("@sniptide/ui", async () => new Response(null, { status: 404 })),
    { current: null, versions: [] },
  )
  for (const status of [401, 500])
    await assert.rejects(
      publicPackage("@sniptide/ui", async () => new Response(null, { status })),
      /lookup failed/,
    )
  const values = {
    "0.1.1": { version: "0.1.1" },
    "0.2.0-beta.1": {},
    "0.1.2": { version: "0.1.2" },
  }
  const result = await publicPackage("@sniptide/ui", async () =>
    Response.json({ name: "@sniptide/ui", versions: values }),
  )
  assert.equal(result.current.version, "0.1.2")
})

const temp = await mkdtemp(path.join(tmpdir(), "sniptide-release-tests-"))
try {
  const base = await packRelease("ui", path.join(temp, "base"), { commit: "a".repeat(40) })
  const baseBytes = await readFile(base.tarball)
  const baseManifest = JSON.parse(
    execFileSync("tar", ["-xOzf", base.tarball, "package/package.json"], { encoding: "utf8" }),
  )
  const npm = (bytes, manifest = baseManifest) => ({
    ...manifest,
    dist: {
      tarball: "https://fixture/tarball",
      integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    },
  })
  const request = (bytes, manifest) => async (url) =>
    url === "https://fixture/tarball"
      ? new Response(bytes)
      : Response.json({ name: "@sniptide/ui", versions: { "0.1.1": npm(bytes, manifest) } })
  await test("unchanged shipped contents ignore source provenance and do not bump", async () => {
    const plan = await planRelease("ui", path.join(temp, "unchanged"), {
      commit: "b".repeat(40),
      request: request(baseBytes),
    })
    assert.equal(plan.changed, false)
    assert.equal(plan.artifact.version, "0.1.1")
    assert.equal(await fingerprint(plan.artifact.tarball), await fingerprint(base.tarball))
  })
  await test("dependency changes and legacy missing files produce independent catch-up releases", async () => {
    const fixture = path.join(temp, "old")
    await mkdir(fixture, { recursive: true })
    await extract({ file: base.tarball, cwd: fixture })
    await writeFile(
      path.join(fixture, "package/package.json"),
      JSON.stringify({
        ...baseManifest,
        dependencies: { ...baseManifest.dependencies, cn: "^0.1.0" },
      }),
    )
    const old = path.join(temp, "old.tgz")
    await create({ gzip: true, file: old, cwd: fixture }, ["package"])
    const bytes = await readFile(old)
    const patch = await planRelease("ui", path.join(temp, "patch"), {
      request: request(bytes),
      messages: [],
    })
    assert.equal(patch.changed, true)
    assert.equal(patch.artifact.version, "0.1.2")
    await writeFile(path.join(fixture, "package/package.json"), JSON.stringify(baseManifest))
    await rm(path.join(fixture, "package/src/components/spinner.tsx"))
    await create({ gzip: true, file: old, cwd: fixture }, ["package"])
    const legacy = await readFile(old)
    const minor = await planRelease("ui", path.join(temp, "minor"), {
      request: request(legacy),
      messages: ["feat(ui): add components"],
    })
    assert.equal(minor.artifact.version, "0.2.0")
    await assert.rejects(
      planRelease("ui", path.join(temp, "bad"), {
        request: request(bytes, { ...baseManifest, gitHead: "invalid" }),
      }),
      /source baseline/,
    )
  })
  await test("publication retries converge after a lost response without a second publish", async () => {
    let visible = false
    let publishes = 0
    const manifest = npm(baseBytes)
    const options = {
      request: async () =>
        visible ? Response.json(manifest) : new Response(null, { status: 404 }),
      publish: async () => {
        publishes++
        visible = true
        throw new Error("response lost")
      },
    }
    await publishExactArtifact(base, options)
    await publishExactArtifact(base, options)
    assert.equal(publishes, 1)
    await assert.rejects(
      publishExactArtifact(base, {
        request: async () => Response.json({ ...manifest, dist: { integrity: "wrong" } }),
        publish: async () => assert.fail("must not publish over an existing version"),
      }),
      /conflicts/,
    )
    await assert.rejects(
      publishExactArtifact(base, {
        request: async () => new Response(null, { status: 500 }),
        publish: async () => assert.fail("must not publish after registry failure"),
      }),
      /lookup failed/,
    )
  })
} finally {
  await rm(temp, { recursive: true, force: true })
}
