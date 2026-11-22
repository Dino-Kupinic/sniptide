import assert from "node:assert/strict"
import { test } from "node:test"
import { buildShards, selectTests, testDurations } from "./ci-plan.mjs"

const specs = ["tests/auth.e2e.ts", "tests/editor.e2e.ts", "tests/pastes.e2e.ts"]

test("main, unknown paths, and unavailable diffs select all suites", () => {
  const full = selectTests(null, specs)
  assert.deepEqual(selectTests([], specs), full)
  assert.deepEqual(selectTests(["packages/ui/src/button.tsx"], specs), full)
  assert.deepEqual(selectTests(["apps/docs/content/docs/a.mdx", "bun.lock"], specs), full)
  assert.deepEqual(full.browser, specs)
  assert.equal(full.web, true)
  assert.equal(full.container, true)
})

test("isolated changes select their own suites and known downstream tests", () => {
  const docs = selectTests(["apps/docs/content/docs/a.mdx"], specs)
  assert.deepEqual(docs.browser, [])
  assert.equal(docs.web || docs.container || docs.cli, false)

  const cli = selectTests(["packages/cli/src/cli.ts"], specs)
  assert.equal(cli.cli, true)
  assert.equal(cli.web, true)
  assert.equal(cli.container, false)
  assert.deepEqual(cli.browser, [])

  const clients = selectTests(
    ["packages/oauth-client/src/index.ts", "packages/sdk-python/a.py"],
    specs,
  )
  assert.equal(clients.extension && clients.vscode && clients.sdk, true)
  assert.equal(clients.raycast || clients.web, false)

  // The admin app's tests run in the database job, without the browser or container suites.
  const admin = selectTests(["apps/admin/lib/store.ts"], specs)
  assert.equal(admin.web, true)
  assert.equal(admin.container, false)
  assert.deepEqual(admin.browser, [])
})

test("web source runs the browser, database, and container coverage", () => {
  const app = selectTests(["apps/web/app/api/v1/pastes/route.ts"], specs)
  assert.deepEqual(app.browser, specs)
  assert.equal(app.web && app.container, true)
  assert.equal(app.cli || app.sdk || app.shared, false)
})

test("one browser spec is selected directly, and changes to helpers or removed specs select all", () => {
  const direct = selectTests(["apps/web/tests/editor.e2e.ts", "apps/extension/src/index.ts"], specs)
  assert.deepEqual(direct.browser, ["tests/editor.e2e.ts"])
  assert.equal(direct.extension, true)
  assert.equal(direct.web, false)
  assert.deepEqual(selectTests(["apps/web/tests/shared/fixture.ts"], specs).browser, specs)
  assert.deepEqual(selectTests(["apps/web/tests/removed.e2e.ts"], specs).browser, specs)
})

test("shards place the longest files first and run every selected file once", () => {
  const files = [...specs, "tests/new.e2e.ts"]
  const times = new Map([
    [specs[0], 40],
    [specs[1], 100],
    [specs[2], 50],
  ])
  assert.deepEqual(buildShards(files, times), [
    { shard: 0, files: [specs[1], specs[0]] },
    { shard: 1, files: [files[3], specs[2]] },
  ])
  assert.deepEqual(buildShards([specs[0]], new Map()), [{ shard: 0, files: [specs[0]] }])
  assert.deepEqual(buildShards([], times), [])
})

test("history sums successful attempts by spec and ignores filtered or malformed entries", () => {
  const results = [
    { file: specs[0], selected: false, status: "skipped", attempts: [] },
    {
      file: specs[0],
      selected: true,
      status: "passed",
      attempts: [{ status: "passed", durationMs: 40 }],
    },
    {
      file: specs[0],
      selected: true,
      status: "passed",
      attempts: [
        { status: "failed", durationMs: 500 },
        { status: "passed", durationMs: 60 },
      ],
    },
    {
      file: specs[1],
      selected: true,
      status: "passed",
      attempts: [{ status: "passed", durationMs: -30 }],
    },
    { file: specs[2], selected: true, status: "passed" },
  ]
  assert.deepEqual(
    testDurations([{ run: { results } }, { run: {} }, null]),
    new Map([[specs[0], 100]]),
  )
})
