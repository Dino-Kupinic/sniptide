import { readFile } from "node:fs/promises"

const shaPattern = /^[a-f0-9]{40}$/
const digestPattern = /^sha256:[a-f0-9]{64}$/
const numberPattern = /^[1-9][0-9]*$/
const appPattern = /^[A-Za-z0-9_-]+$/
const repoPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

export async function managePreview(
  config,
  request = fetch,
  delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
) {
  const {
    action,
    receipt,
    repo,
    pr,
    runId,
    runAttempt,
    githubToken,
    coolifyToken,
    coolifyUrl,
    appId,
  } = config
  if (
    !["workflow_run", "workflow_dispatch"].includes(action) ||
    !repoPattern.test(repo ?? "") ||
    !numberPattern.test(pr ?? "") ||
    Number(pr) > 2147483647 ||
    !appPattern.test(appId ?? "") ||
    !githubToken ||
    !coolifyToken
  )
    throw new Error("Invalid preview configuration")
  const origin = (value) => {
    const u = new URL(value)
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      u.pathname !== "/"
    )
      throw new Error("Coolify URL must be an HTTPS origin")
    return u.origin
  }
  const previewOrigin = origin(coolifyUrl)
  const api = async (base, path, token, options = {}, allow404 = false) => {
    const response = await request(`${base}${path}`, {
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    })
    if (allow404 && response.status === 404) return null
    if (!response.ok) throw new Error(`API request failed (${response.status}): ${path}`)
    return response.json()
  }
  const github = (path) => api("https://api.github.com", `/repos/${repo}${path}`, githubToken)
  const coolify = (path, options, allow404) =>
    api(previewOrigin, `/api/v1${path}`, coolifyToken, options, allow404)
  const environment = await github("/environments/coolify-preview")
  const policies = await github(
    "/environments/coolify-preview/deployment-branch-policies?per_page=100",
  )
  if (
    environment.deployment_branch_policy?.custom_branch_policies !== true ||
    environment.deployment_branch_policy?.protected_branches !== false ||
    policies.total_count !== 1 ||
    policies.branch_policies?.length !== 1 ||
    policies.branch_policies[0].name !== "main" ||
    (policies.branch_policies[0].type != null && policies.branch_policies[0].type !== "branch")
  )
    throw new Error("Preview environment must allow only the main branch")
  const image = `ghcr.io/${repo.toLowerCase()}`
  const app = await coolify(`/applications/${appId}`)
  if (
    app.uuid !== appId ||
    app.build_pack !== "dockerimage" ||
    app.docker_registry_image_name !== image
  )
    throw new Error("Unexpected preview image resource")
  const current = async () => {
    const pull = await github(`/pulls/${pr}`)
    if (
      pull.number !== Number(pr) ||
      pull.base?.repo?.full_name !== repo ||
      pull.head?.repo?.full_name !== repo ||
      pull.user?.login === "dependabot[bot]"
    )
      throw new Error("Pull request is outside the trusted preview scope")
    return pull
  }
  if (action === "workflow_dispatch") {
    let pull = await current()
    if (pull.state !== "closed") throw new Error("Pull request is not closed")
    const preview = await coolify(`/applications/${appId}/previews/${pr}`, {}, true)
    if (!preview) {
      console.log(
        "Preview record absent; verify the server for orphan containers or queued deployments.",
      )
      return
    }
    if (preview.pull_request_id !== Number(pr)) throw new Error("Preview identity mismatch")
    pull = await current()
    if (pull.state !== "closed") throw new Error("Pull request reopened before cleanup")
    const deleted = await coolify(
      `/applications/${appId}/previews/${pr}`,
      { method: "DELETE" },
      true,
    )
    console.log(
      deleted
        ? "Cleanup requested; verify containers and queued deployments on the server."
        : "Preview record disappeared; verify the server for orphan containers or queued deployments.",
    )
    return
  }
  const history = await coolify(`/deployments/applications/${appId}?take=1`)
  const applicationId = history.deployments?.[0]?.application_id
  if (
    typeof applicationId !== "string" ||
    !numberPattern.test(applicationId) ||
    (app.id !== undefined && String(app.id) !== applicationId)
  )
    throw new Error("Deployment history does not identify the preview application")
  if (
    !numberPattern.test(runId ?? "") ||
    !numberPattern.test(runAttempt ?? "") ||
    !receipt ||
    Object.keys(receipt).sort().join(",") !==
      "base_sha,build_attempt,digest,head_sha,merge_sha,pr,repository,run_attempt,run_id" ||
    receipt.repository !== repo ||
    receipt.pr !== pr ||
    receipt.run_id !== runId ||
    receipt.run_attempt !== runAttempt ||
    !numberPattern.test(receipt.build_attempt ?? "") ||
    Number(receipt.build_attempt) > Number(runAttempt) ||
    ![receipt.head_sha, receipt.base_sha, receipt.merge_sha].every(
      (value) => typeof value === "string" && shaPattern.test(value),
    ) ||
    !digestPattern.test(receipt.digest ?? "")
  )
    throw new Error("Invalid preview receipt")
  const workflow = await github("/actions/workflows/ci.yml")
  const run = await github(`/actions/runs/${runId}`)
  if (
    run.id !== Number(runId) ||
    run.run_attempt !== Number(runAttempt) ||
    run.status !== "completed" ||
    run.conclusion !== "success" ||
    run.event !== "pull_request" ||
    run.workflow_id !== workflow.id ||
    run.repository?.full_name !== repo ||
    !run.repository?.id ||
    run.head_repository?.id !== run.repository.id ||
    run.actor?.login === "dependabot[bot]" ||
    ![receipt.head_sha, receipt.merge_sha].includes(run.head_sha) ||
    !Array.isArray(run.pull_requests) ||
    run.pull_requests.length !== 1 ||
    run.pull_requests[0]?.number !== Number(pr)
  )
    throw new Error("Source run is not trusted pull request CI")
  const verifyCurrent = async () => {
    const pull = await current()
    if (
      pull.state !== "open" ||
      pull.base.ref !== "main" ||
      pull.head.sha !== receipt.head_sha ||
      pull.base.sha !== receipt.base_sha ||
      pull.merge_commit_sha !== receipt.merge_sha
    )
      throw new Error("Pull request or tested merge has changed")
  }
  let queueClear = false
  for (let attempt = 0; attempt < 12; attempt++) {
    const queue = await coolify("/deployments")
    if (!Array.isArray(queue) && (!queue || typeof queue !== "object"))
      throw new Error("Invalid deployment queue")
    let active = false
    for (const entry of Object.values(queue)) {
      if (
        !entry ||
        typeof entry.application_id !== "string" ||
        !["queued", "in_progress"].includes(entry.status)
      )
        throw new Error("Invalid deployment queue entry")
      if (entry.application_id === applicationId) active = true
    }
    if (!active) {
      queueClear = true
      break
    }
    if (attempt < 11) await delay(5000)
  }
  if (!queueClear) throw new Error("Preview app deployment queue did not clear")
  await verifyCurrent()
  const tag = receipt.digest.replace(":", "-")
  const result = await coolify(`/applications/${appId}/previews`, {
    method: "POST",
    body: JSON.stringify({ pull_request_id: Number(pr), docker_tag: tag }),
  })
  const deploymentId = result.deployment_uuid
  if (!appPattern.test(deploymentId ?? ""))
    throw new Error("Coolify did not provide a preview deployment ID")
  for (let attempt = 0; attempt < 120; attempt++) {
    const state = await coolify(`/deployments/${deploymentId}`)
    if (
      state.deployment_uuid !== deploymentId ||
      state.application_id !== applicationId ||
      state.pull_request_id !== Number(pr) ||
      state.docker_registry_image_tag !== tag
    )
      throw new Error("Preview deployment identity mismatch")
    if (state.status === "finished") {
      const preview = await coolify(`/applications/${appId}/previews/${pr}`)
      if (preview.pull_request_id !== Number(pr) || preview.docker_registry_image_tag !== tag)
        throw new Error("Preview image identity mismatch")
      await verifyCurrent()
      console.log(
        "Coolify deployment finished with the expected image reference; runtime health is not verified.",
      )
      return
    }
    if (!["queued", "in_progress"].includes(state.status))
      throw new Error(`Preview ended with status ${state.status}`)
    await delay(5000)
  }
  throw new Error("Preview deployment timed out; inspect Coolify before retrying")
}

if (import.meta.main) {
  const e = process.env
  const receipt =
    e.EVENT_TYPE === "workflow_run"
      ? readFile(`${e.RUNNER_TEMP}/preview-receipt/receipt.json`, "utf8").then((text) => {
          if (text.length > 4096) throw new Error("Preview receipt too large")
          return JSON.parse(text)
        })
      : Promise.resolve(null)
  receipt
    .then((data) =>
      managePreview({
        action: e.EVENT_TYPE,
        receipt: data,
        repo: e.GITHUB_REPOSITORY,
        pr: e.PR_NUMBER,
        runId: e.SOURCE_RUN_ID,
        runAttempt: e.SOURCE_ATTEMPT,
        githubToken: e.GH_TOKEN,
        coolifyToken: e.COOLIFY_TOKEN,
        coolifyUrl: e.COOLIFY_URL,
        appId: e.COOLIFY_APP_ID,
      }),
    )
    .catch((error) => {
      console.error(`${error.message}. Inspect preview state before retrying.`)
      process.exitCode = 1
    })
}
