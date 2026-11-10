import { readFile } from "node:fs/promises"

const shaPattern = /^[a-f0-9]{40}$/
const digestPattern = /^sha256:[a-f0-9]{64}$/
const numberPattern = /^[1-9][0-9]*$/
const appPattern = /^[A-Za-z0-9_-]+$/
const repoPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

export async function deployProduction(
  config,
  request = fetch,
  delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
) {
  const { receipt, repo, runId, runAttempt, sha, githubToken, coolifyToken, coolifyUrl, appId } =
    config
  if (
    !repoPattern.test(repo ?? "") ||
    !numberPattern.test(runId ?? "") ||
    !numberPattern.test(runAttempt ?? "") ||
    !shaPattern.test(sha ?? "") ||
    !appPattern.test(appId ?? "") ||
    !githubToken ||
    !coolifyToken
  )
    throw new Error("Invalid deployment configuration")
  if (
    !receipt ||
    Object.keys(receipt).sort().join(",") !==
      "build_attempt,digest,repository,run_attempt,run_id,sha" ||
    receipt.repository !== repo ||
    receipt.sha !== sha ||
    receipt.run_id !== runId ||
    receipt.run_attempt !== runAttempt ||
    !numberPattern.test(receipt.build_attempt ?? "") ||
    Number(receipt.build_attempt) > Number(runAttempt) ||
    !digestPattern.test(receipt.digest ?? "")
  )
    throw new Error("Invalid image receipt")
  const url = new URL(coolifyUrl)
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("Coolify URL must be an HTTPS origin")
  const api = async (origin, path, token, options = {}) => {
    const response = await request(`${origin}${path}`, {
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    })
    if (!response.ok) throw new Error(`API request failed (${response.status}): ${path}`)
    return response.json()
  }
  const github = (path) => api("https://api.github.com", `/repos/${repo}${path}`, githubToken)
  const coolify = (path, options) => api(url.origin, `/api/v1${path}`, coolifyToken, options)
  const workflow = await github("/actions/workflows/ci.yml")
  const run = await github(`/actions/runs/${runId}`)
  if (
    run.id !== Number(runId) ||
    run.run_attempt !== Number(runAttempt) ||
    run.status !== "completed" ||
    !run.repository?.id ||
    run.head_repository?.id !== run.repository.id ||
    run.workflow_id !== workflow.id ||
    run.event !== "push" ||
    run.head_branch !== "main" ||
    run.head_sha !== sha ||
    run.conclusion !== "success" ||
    run.repository?.full_name !== repo
  )
    throw new Error("Source run is not successful main CI")
  const current = async () => {
    const main = await github("/branches/main")
    if (main.commit?.sha !== sha) throw new Error("Main has moved since CI")
  }
  const image = `ghcr.io/${repo.toLowerCase()}`
  const app = await coolify(`/applications/${appId}`)
  if (
    !Number.isSafeInteger(app.id) ||
    app.id <= 0 ||
    app.uuid !== appId ||
    app.build_pack !== "dockerimage" ||
    app.docker_registry_image_name !== image ||
    app.status !== "running:healthy" ||
    app.health_check_enabled !== true ||
    app.health_check_type !== "cmd" ||
    app.health_check_command !== "node /app/healthcheck.cjs" ||
    app.ports_mappings ||
    app.custom_docker_run_options ||
    app.settings?.is_consistent_container_name_enabled !== false ||
    app.settings?.custom_internal_name ||
    !String(app.destination_type ?? "").endsWith("StandaloneDocker")
  )
    throw new Error("Resource failed image, health or rolling-update preflight")
  // v4.6 hides logs unless the token can read sensitive deployment data. Verify access
  // before changing the resource; the finished deployment must prove its image and rollout.
  const history = await coolify(`/deployments/applications/${appId}?take=1`)
  const previous = history.deployments?.[0]
  if (!previous || typeof previous.logs !== "string" || !Array.isArray(JSON.parse(previous.logs)))
    throw new Error("Deployment log access is required before changing the resource")
  const queue = await coolify("/deployments")
  if (!Array.isArray(queue) && (!queue || typeof queue !== "object"))
    throw new Error("Invalid deployment queue")
  for (const item of Object.values(queue)) {
    if (
      !item ||
      typeof item.application_id !== "string" ||
      !["queued", "in_progress"].includes(item.status)
    )
      throw new Error("Invalid deployment queue entry")
    if (item.application_id === String(app.id)) throw new Error("Another deployment is active")
  }
  await current()
  const imageTag = receipt.digest.replace(":", "-")
  await coolify(`/applications/${appId}`, {
    method: "PATCH",
    body: JSON.stringify({ docker_registry_image_tag: imageTag }),
  })
  // PATCH may have taken effect even if a subsequent request fails. Never guess at rollback.
  await current()
  const result = await coolify("/deploy", { method: "POST", body: JSON.stringify({ uuid: appId }) })
  const deploymentId = result.deployments?.find(
    (entry) => entry.resource_uuid === appId,
  )?.deployment_uuid
  if (!appPattern.test(deploymentId ?? ""))
    throw new Error("Coolify did not provide a deployment ID; inspect the queue and resource")
  for (let attempt = 0; attempt < 120; attempt++) {
    const state = await coolify(`/deployments/${deploymentId}`)
    if (String(state.application_id) !== String(app.id) || state.deployment_uuid !== deploymentId)
      throw new Error("Deployment identity mismatch")
    if (state.status === "finished") {
      const logs = typeof state.logs === "string" ? JSON.parse(state.logs) : null
      if (
        !Array.isArray(logs) ||
        !logs.some(
          (entry) =>
            typeof entry.output === "string" && entry.output.includes(`${image}@${receipt.digest}`),
        ) ||
        !logs.some((entry) => entry.output === "New container is healthy.") ||
        !logs.some((entry) => entry.output === "Rolling update completed.")
      )
        throw new Error("Deployment logs do not verify image and rolling update")
      // Coolify's application status refresh can lag behind the completed deployment.
      for (let poll = 0; poll < 12; poll++) {
        const after = await coolify(`/applications/${appId}`)
        if (after.docker_registry_image_tag !== imageTag)
          throw new Error("Resource image changed after deployment")
        if (after.status === "running:healthy") {
          await current()
          return
        }
        await delay(5000)
      }
      throw new Error("Resource did not report healthy before timeout")
    }
    if (!["queued", "in_progress"].includes(state.status))
      throw new Error(`Deployment ended with status ${state.status}`)
    await delay(5000)
  }
  throw new Error("Deployment timed out; inspect Coolify before retrying")
}

if (import.meta.main) {
  const e = process.env
  const path = `${e.RUNNER_TEMP}/image-receipt/receipt.json`
  readFile(path, "utf8")
    .then((data) => {
      if (data.length > 4096) throw new Error("Image receipt too large")
      return deployProduction({
        receipt: JSON.parse(data),
        repo: e.GITHUB_REPOSITORY,
        runId: e.SOURCE_RUN_ID,
        runAttempt: e.SOURCE_ATTEMPT,
        sha: e.SOURCE_SHA,
        githubToken: e.GH_TOKEN,
        coolifyUrl: e.COOLIFY_URL,
        coolifyToken: e.COOLIFY_TOKEN,
        appId: e.COOLIFY_APP_ID,
      })
    })
    .catch((error) => {
      console.error(`${error.message}. Inspect Coolify before retrying or changing image settings.`)
      process.exitCode = 1
    })
}
