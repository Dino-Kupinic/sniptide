import assert from "node:assert/strict"
import test from "node:test"
import { reconcile } from "./reconcile-previews.mjs"

const config = {
  repo: "Owner/Repo",
  githubToken: "github",
  coolifyUrl: "https://preview.example/",
  coolifyToken: "preview",
  appId: "preview-1",
}
function mock(options = {}) {
  const requests = []
  const dispatched = []
  const request = async (url, args) => {
    requests.push({ url, args })
    const path = new URL(url).pathname
    let data
    if (path.endsWith("/environments/coolify-preview/deployment-branch-policies"))
      data = options.policies ?? {
        total_count: 1,
        branch_policies: [{ name: "main", type: "branch" }],
      }
    else if (path.endsWith("/environments/coolify-preview"))
      data = {
        deployment_branch_policy: { custom_branch_policies: true, protected_branches: false },
      }
    else if (path.endsWith("/applications/preview-1/previews"))
      data = options.previews ?? [
        { pull_request_id: 7 },
        { pull_request_id: 8 },
        { pull_request_id: 9 },
      ]
    else if (path.endsWith("/applications/preview-1"))
      data = {
        uuid: "preview-1",
        build_pack: "dockerimage",
        docker_registry_image_name: "ghcr.io/owner/repo",
      }
    else if (/\/pulls\/\d+$/.test(path)) {
      const n = Number(path.split("/").at(-1))
      data = {
        number: n,
        state: n === 8 ? "open" : "closed",
        user: { login: "human" },
        head: { repo: { full_name: n === 9 ? "fork/repo" : "Owner/Repo" } },
        base: { repo: { full_name: "Owner/Repo" }, ref: "retargeted" },
      }
    } else throw new Error(`unexpected ${path}`)
    return { ok: true, status: 200, json: async () => data }
  }
  return {
    requests,
    dispatched,
    request,
    dispatch: async (repo, pr) => dispatched.push([repo, pr]),
  }
}
test("dispatches only closed same-repo preview cleanup, including retargeted PRs", async () => {
  const m = mock()
  await reconcile(config, m.request, m.dispatch)
  assert.deepEqual(m.dispatched, [["Owner/Repo", 7]])
  assert.ok(m.requests.every(({ args }) => args.redirect === "error"))
})
test("fails closed for ambiguous inventory or unsafe environment", async () => {
  for (const options of [
    { previews: [{ pull_request_id: 7 }, { pull_request_id: 7 }] },
    { previews: {} },
    { policies: { total_count: 1, branch_policies: [{ name: "*" }] } },
  ]) {
    const m = mock(options)
    await assert.rejects(reconcile(config, m.request, m.dispatch))
    assert.equal(m.dispatched.length, 0)
  }
})
