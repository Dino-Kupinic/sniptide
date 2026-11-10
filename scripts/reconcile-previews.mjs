import { execFileSync } from "node:child_process"

export async function reconcile(
  config,
  request = fetch,
  dispatch = (repo, pr) =>
    execFileSync(
      "gh",
      ["workflow", "run", "deploy-preview.yml", "--repo", repo, "--ref", "main", "-f", `pr=${pr}`],
      { stdio: "ignore" },
    ),
) {
  const { repo, githubToken, coolifyUrl, coolifyToken, appId } = config
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo ?? "") ||
    !/^[A-Za-z0-9_-]+$/.test(appId ?? "") ||
    !githubToken ||
    !coolifyToken
  )
    throw new Error("Invalid preview reconciliation configuration")
  const url = new URL(coolifyUrl)
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("Coolify URL must be an HTTPS origin")
  const api = async (origin, path, token, allow404 = false) => {
    const response = await request(`${origin}${path}`, {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    })
    if (allow404 && response.status === 404) return null
    if (!response.ok) throw new Error(`API request failed (${response.status}): ${path}`)
    return response.json()
  }
  const github = (path, allow404) =>
    api("https://api.github.com", `/repos/${repo}${path}`, githubToken, allow404)
  const coolify = (path) => api(url.origin, `/api/v1${path}`, coolifyToken)
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
  const app = await coolify(`/applications/${appId}`)
  if (
    app.uuid !== appId ||
    app.build_pack !== "dockerimage" ||
    app.docker_registry_image_name !== `ghcr.io/${repo.toLowerCase()}`
  )
    throw new Error("Unexpected preview image resource")
  const previews = await coolify(`/applications/${appId}/previews`)
  if (!Array.isArray(previews) || previews.length > 1000)
    throw new Error("Invalid or too large preview inventory")
  const seen = new Set()
  for (const preview of previews) {
    const pr = preview?.pull_request_id
    if (!Number.isSafeInteger(pr) || pr < 1 || pr > 2147483647 || seen.has(pr))
      throw new Error("Invalid preview inventory entry")
    seen.add(pr)
  }
  for (const pr of seen) {
    const pull = await github(`/pulls/${pr}`, true)
    if (!pull) continue
    if (
      pull.number !== pr ||
      pull.head?.repo?.full_name !== repo ||
      pull.base?.repo?.full_name !== repo ||
      typeof pull.user?.login !== "string" ||
      pull.user.login === "dependabot[bot]" ||
      pull.state !== "closed"
    )
      continue
    await dispatch(repo, pr)
  }
}

if (import.meta.main) {
  const e = process.env
  reconcile({
    repo: e.GITHUB_REPOSITORY,
    githubToken: e.GH_TOKEN,
    coolifyUrl: e.COOLIFY_URL,
    coolifyToken: e.COOLIFY_TOKEN,
    appId: e.COOLIFY_APP_ID,
  }).catch((error) => {
    console.error(`${error.message}. Inspect preview inventory and reconcile manually.`)
    process.exitCode = 1
  })
}
