import assert from "node:assert/strict"
import test from "node:test"
import { managePreview } from "./deploy-preview.mjs"

const head = "a".repeat(40)
const base = "b".repeat(40)
const merge = "c".repeat(40)
const digest = `sha256:${"d".repeat(64)}`
const receipt = {
  repository: "Owner/Repo",
  pr: "7",
  head_sha: head,
  base_sha: base,
  merge_sha: merge,
  run_id: "42",
  run_attempt: "2",
  build_attempt: "1",
  digest,
}
const config = {
  action: "workflow_run",
  receipt,
  repo: "Owner/Repo",
  pr: "7",
  runId: "42",
  runAttempt: "2",
  githubToken: "github",
  coolifyToken: "preview",
  coolifyUrl: "https://preview-coolify.example/",
  appId: "preview-1",
}
function mock(options = {}) {
  const calls = []
  let prReads = 0
  let queueReads = 0
  const request = async (url, args) => {
    calls.push({ url, ...args })
    const path = new URL(url).pathname
    let data
    if (path.endsWith("/environments/coolify-preview/deployment-branch-policies")) {
      data = options.policies ?? {
        total_count: 1,
        branch_policies: [{ name: "main", type: "branch" }],
      }
    } else if (path.endsWith("/environments/coolify-preview")) {
      data = options.environment ?? {
        deployment_branch_policy: { custom_branch_policies: true, protected_branches: false },
      }
    } else if (path.endsWith("/applications/preview-1/previews/7")) {
      if (options.missing) return { ok: false, status: 404 }
      data = { pull_request_id: 7, docker_registry_image_tag: digest.replace(":", "-") }
    } else if (path.endsWith("/applications/preview-1/previews"))
      data = { deployment_uuid: "deployment-1" }
    else if (path.endsWith("/deployments/applications/preview-1"))
      data = {
        deployments: [
          { application_id: options.historyId === undefined ? "9" : options.historyId },
        ],
      }
    else if (path.endsWith("/applications/preview-1"))
      data = {
        id: 9,
        uuid: "preview-1",
        build_pack: "dockerimage",
        docker_registry_image_name: "ghcr.io/owner/repo",
        ...options.app,
      }
    else if (path.endsWith("/actions/workflows/ci.yml")) data = { id: 11 }
    else if (path.endsWith("/actions/runs/42"))
      data = {
        id: 42,
        run_attempt: 2,
        status: "completed",
        conclusion: "success",
        event: "pull_request",
        workflow_id: 11,
        repository: { id: 3, full_name: "Owner/Repo" },
        head_repository: { id: 3 },
        actor: { login: "human" },
        head_sha: head,
        pull_requests: [{ number: 7 }],
        ...options.run,
      }
    else if (path.endsWith("/pulls/7")) {
      prReads++
      data = {
        number: 7,
        state: options.reopen && prReads > 1 ? "open" : options.closed ? "closed" : "open",
        user: { login: "human" },
        head: { sha: head, repo: { full_name: "Owner/Repo" } },
        base: { ref: "main", sha: base, repo: { full_name: "Owner/Repo" } },
        merge_commit_sha: merge,
        ...options.pull,
      }
    } else if (path.endsWith("/deployments")) {
      data = options.queues?.[queueReads++] ?? options.queue ?? []
    } else if (path.endsWith("/deployments/deployment-1"))
      data = {
        deployment_uuid: "deployment-1",
        application_id: "9",
        pull_request_id: 7,
        docker_registry_image_tag: digest.replace(":", "-"),
        status: "finished",
      }
    else throw new Error(`unexpected ${path}`)
    return { ok: true, status: 200, json: async () => data }
  }
  return { calls, request }
}
const run = (m, c = config) => managePreview(c, m.request, async () => {})
const noWrites = (m) => assert.ok(m.calls.every((call) => !call.method))

test("deploys tested digest only after validating same-repo current merge", async () => {
  const m = mock()
  await run(m)
  const post = m.calls.find((call) => call.method === "POST")
  assert.deepEqual(JSON.parse(post.body), {
    pull_request_id: 7,
    docker_tag: digest.replace(":", "-"),
  })
  assert.ok(m.calls.every((call) => call.redirect === "error"))
})

test("uses deployment history when Coolify hides the preview application ID", async () => {
  const m = mock({ app: { id: undefined } })
  await run(m)
  assert.ok(m.calls.some((call) => call.method === "POST"))
  const busy = mock({ app: { id: undefined }, queue: [{ application_id: "9", status: "queued" }] })
  await assert.rejects(run(busy))
  noWrites(busy)
})

test("rejects missing or inconsistent preview history identity", async () => {
  for (const historyId of [null, "", "0", "invalid", "10"]) {
    const m = mock({ historyId })
    await assert.rejects(run(m))
    noWrites(m)
  }
})

test("rejects fork, bot, wrong workflow and stale merge before mutation", async () => {
  for (const options of [
    { run: { head_repository: { id: 4 } } },
    { run: { actor: { login: "dependabot[bot]" } } },
    { run: { workflow_id: 12 } },
    { run: { status: "in_progress" } },
    { run: { pull_requests: [] } },
    { pull: { user: { login: "dependabot[bot]" } } },
    { pull: { head: { sha: head, repo: { full_name: "Fork/Repo" } } } },
    { pull: { base: { ref: "feature", sha: base, repo: { full_name: "Owner/Repo" } } } },
    { pull: { merge_commit_sha: "e".repeat(40) } },
    { queue: [{ application_id: "9", status: "queued" }] },
  ]) {
    const m = mock(options)
    await assert.rejects(run(m))
    noWrites(m)
  }
})

test("rejects unprotected environment and malformed receipts before mutation", async () => {
  const badEnvironment = mock({ policies: { total_count: 1, branch_policies: [{ name: "*" }] } })
  await assert.rejects(run(badEnvironment))
  noWrites(badEnvironment)
  const badReceipt = mock()
  await assert.rejects(run(badReceipt, { ...config, receipt: { ...receipt, run_attempt: "3" } }))
  noWrites(badReceipt)
})

test("waits for other preview deployments and rechecks PR state", async () => {
  const m = mock({ queues: [[{ application_id: "9", status: "queued" }], []] })
  await run(m)
  assert.equal(m.calls.filter((call) => call.url.endsWith("/deployments")).length, 2)
})

test("closed preview cleanup is idempotent and checks state again before delete", async () => {
  const cleanup = { ...config, action: "workflow_dispatch" }
  const missing = mock({ closed: true, missing: true })
  await run(missing, cleanup)
  noWrites(missing)
  const closed = mock({ closed: true })
  await run(closed, cleanup)
  assert.equal(closed.calls.at(-1).method, "DELETE")
  const reopened = mock({ closed: true, reopen: true })
  await assert.rejects(run(reopened, cleanup))
  noWrites(reopened)
})

test("a new successful run can recreate a reopened preview", async () => {
  const m = mock()
  await run(m)
  assert.ok(m.calls.some((call) => call.method === "POST"))
})

test("cleans a closed known preview even after retargeting", async () => {
  const m = mock({
    closed: true,
    pull: { base: { ref: "other", sha: base, repo: { full_name: "Owner/Repo" } } },
  })
  await run(m, { ...config, action: "workflow_dispatch" })
  assert.equal(m.calls.at(-1).method, "DELETE")
})
