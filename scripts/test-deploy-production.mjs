import assert from "node:assert/strict"
import test from "node:test"
import { deployProduction } from "./deploy-production.mjs"

const sha = "a".repeat(40)
const digest = `sha256:${"b".repeat(64)}`
const receipt = {
  repository: "Owner/Repo",
  sha,
  run_id: "42",
  run_attempt: "2",
  build_attempt: "1",
  digest,
}
const config = {
  receipt,
  repo: "Owner/Repo",
  sha,
  runId: "42",
  runAttempt: "2",
  githubToken: "gh",
  coolifyUrl: "https://coolify.example/",
  coolifyToken: "secret",
  appId: "app-1",
}
function mock(overrides = {}) {
  const calls = []
  const app = {
    id: 23,
    uuid: "app-1",
    build_pack: "dockerimage",
    docker_registry_image_name: "ghcr.io/owner/repo",
    docker_registry_image_tag: digest.replace(":", "-"),
    status: "running:healthy",
    health_check_enabled: true,
    health_check_type: "cmd",
    health_check_command: "node /app/healthcheck.cjs",
    ports_mappings: null,
    custom_docker_run_options: null,
    settings: {
      is_consistent_container_name_enabled: false,
      custom_internal_name: null,
      rolling_update_drain_seconds: 10,
    },
    destination_type: "App\\Models\\StandaloneDocker",
    ...overrides.app,
  }
  let appReads = 0
  const request = async (url, options) => {
    calls.push({ url, ...options })
    const path = new URL(url).pathname
    let data
    if (path.endsWith("/actions/workflows/ci.yml")) data = { id: 9 }
    else if (path.endsWith("/actions/runs/42"))
      data = {
        id: 42,
        run_attempt: 2,
        status: "completed",
        head_repository: { id: 1 },
        workflow_id: 9,
        event: "push",
        head_branch: "main",
        head_sha: sha,
        conclusion: "success",
        repository: { id: 1, full_name: "Owner/Repo" },
        ...overrides.run,
      }
    else if (path.endsWith("/branches/main")) data = { commit: { sha: overrides.main ?? sha } }
    else if (path.endsWith("/deployments/applications/app-1"))
      data = {
        deployments: [
          {
            application_id: overrides.historyId === undefined ? "23" : overrides.historyId,
            logs: overrides.historyLogs === undefined ? "[]" : overrides.historyLogs,
          },
        ],
      }
    else if (path.endsWith("/applications/app-1")) {
      if (!options.method) appReads++
      data = {
        ...app,
        status:
          appReads > 1 && appReads <= (overrides.unhealthyReads ?? 0) + 1 ? "running" : app.status,
      }
    } else if (path.endsWith("/deployments")) data = overrides.queue ?? []
    else if (path.endsWith("/deploy"))
      data = { deployments: [{ resource_uuid: "app-1", deployment_uuid: "deploy-1" }] }
    else if (path.endsWith("/deployments/deploy-1"))
      data = {
        deployment_uuid: "deploy-1",
        application_id: "23",
        status: "finished",
        logs: JSON.stringify([
          { output: `Starting deployment of ghcr.io/owner/repo@${digest}` },
          { output: "New container is healthy." },
          { output: "Rolling update completed." },
        ]),
        ...overrides.deployment,
      }
    else throw new Error(`unexpected request ${path}`)
    return { ok: true, json: async () => data }
  }
  return { calls, request }
}
const run = (m, c = config) => deployProduction(c, m.request, async () => {})
const noWrites = (m) => assert.ok(m.calls.every((call) => !call.method))

test("deploys only the receipt digest, checks queue, identity and health", async () => {
  const m = mock()
  await run(m)
  assert.deepEqual(JSON.parse(m.calls.find((call) => call.method === "PATCH").body), {
    docker_registry_image_tag: digest.replace(":", "-"),
  })
  assert.ok(m.calls.some((call) => call.url.endsWith("/deployments")))
  assert.ok(m.calls.every((call) => call.redirect === "error"))
})

test("uses the target's deployment history when Coolify hides the application ID", async () => {
  const m = mock({ app: { id: undefined } })
  await run(m)
  assert.ok(m.calls.some((call) => call.method === "PATCH"))
  const busy = mock({ app: { id: undefined }, queue: [{ application_id: "23", status: "queued" }] })
  await assert.rejects(run(busy))
  noWrites(busy)
})

test("rejects missing or inconsistent history identity before mutation", async () => {
  for (const historyId of [null, "", "0", "not-an-id", "24"]) {
    const m = mock({ historyId })
    await assert.rejects(run(m))
    noWrites(m)
  }
})

test("rejects mismatched receipt and untrusted or stale source runs before mutation", async () => {
  for (const [settings, conf] of [
    [{}, { ...config, receipt: { ...receipt, run_attempt: "1" } }],
    [{ run: { event: "pull_request" } }, config],
    [{ run: { workflow_id: 10 } }, config],
    [{ run: { status: "in_progress" } }, config],
    [{ run: { head_repository: { id: 2 } } }, config],
    [{}, { ...config, receipt: { ...receipt, build_attempt: "3" } }],
    [{ main: "f".repeat(40) }, config],
  ]) {
    const m = mock(settings)
    await assert.rejects(run(m, conf))
    noWrites(m)
  }
})

test("refuses unsafe resources and active deployments", async () => {
  for (const settings of [
    {
      app: {
        settings: { is_consistent_container_name_enabled: false, rolling_update_drain_seconds: 0 },
      },
    },
    {
      app: {
        settings: { is_consistent_container_name_enabled: false, rolling_update_drain_seconds: -1 },
      },
    },
    { app: { settings: { is_consistent_container_name_enabled: false } } },
    {
      app: {
        settings: {
          is_consistent_container_name_enabled: false,
          rolling_update_drain_seconds: null,
        },
      },
    },
    {
      app: {
        settings: {
          is_consistent_container_name_enabled: false,
          rolling_update_drain_seconds: "10",
        },
      },
    },
    { app: { health_check_enabled: false } },
    { app: { health_check_type: "http" } },
    { app: { health_check_command: "true" } },
    { app: { ports_mappings: "80:80" } },
    { app: { build_pack: "dockerfile" } },
    { historyLogs: null },
    { queue: [{ application_id: "23", status: "in_progress" }] },
    { queue: { 3: { application_id: "23", status: "queued" } } },
  ]) {
    const m = mock(settings)
    await assert.rejects(run(m))
    noWrites(m)
  }
})

test("fails if Coolify does not report the intended image and rolling completion", async () => {
  for (const deployment of [
    { logs: JSON.stringify([{ output: "Rolling update completed." }]) },
    { logs: JSON.stringify([{ output: `ghcr.io/owner/repo@${digest}` }]) },
    {
      logs: JSON.stringify([
        { output: `Starting deployment of ghcr.io/owner/repo@${digest}` },
        { output: "New container is healthy." },
        { output: "The proxy labels changed, so the old containers stop without waiting." },
        { output: "Rolling update completed." },
      ]),
    },
    { status: "failed" },
    { application_id: "24" },
  ]) {
    const m = mock({ deployment })
    await assert.rejects(run(m))
  }
})

test("waits for Coolify's application health status to refresh", async () => {
  const m = mock({ unhealthyReads: 2 })
  await run(m)
  assert.equal(
    m.calls.filter((call) => call.url.endsWith("/applications/app-1") && !call.method).length,
    4,
  )
})
