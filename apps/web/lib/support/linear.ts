import "server-only"

import { createHash } from "node:crypto"

// Files reports in Linear through its GraphQL API: a new issue in the team's Triage state with the
// Bug or Feedback label, or a comment on the open issue that already carries the same report key.
// Only used when LINEAR_API_KEY and LINEAR_TEAM_ID are set (lib/config.ts).

const ENDPOINT = "https://api.linear.app/graphql"
const TIMEOUT_MS = 10_000

export interface LinearSettings {
  apiKey: string
  team: string
  project?: string
}

export interface LinearIssue {
  id: string
  identifier: string
  url: string
}

export interface FiledReport {
  issue: LinearIssue
  duplicate: boolean
}

export class LinearError extends Error {}

async function request<T>(
  settings: LinearSettings,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: settings.apiKey },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    throw new LinearError(`Linear couldn't be reached: ${(error as Error).message}`)
  }
  const body = (await response.json().catch(() => null)) as {
    data?: T
    errors?: { message: string }[]
  } | null
  if (!response.ok || !body?.data || body.errors?.length) {
    const message = body?.errors?.map((error) => error.message).join("; ") || response.statusText
    throw new LinearError(`Linear refused the request (${response.status}): ${message}`)
  }
  return body.data
}

interface Workspace {
  teamId: string
  triageStateId?: string
  labels: Partial<Record<"bug" | "feedback", string>>
}

// The team, its Triage state and the two labels rarely change, so each process looks them up once.
const workspaces = new Map<string, Promise<Workspace>>()

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function lookUpWorkspace(settings: LinearSettings): Promise<Workspace> {
  let teamId = settings.team
  if (!UUID.test(teamId)) {
    const data = await request<{ teams: { nodes: { id: string }[] } }>(
      settings,
      "query Team($key: String!) { teams(filter: { key: { eqIgnoreCase: $key } }) { nodes { id } } }",
      { key: settings.team },
    )
    const team = data.teams.nodes[0]
    if (!team) throw new LinearError(`Linear has no team with the key ${settings.team}.`)
    teamId = team.id
  }
  const data = await request<{
    team: { states: { nodes: { id: string }[] } }
    issueLabels: { nodes: { id: string; name: string; team: { id: string } | null }[] }
  }>(
    settings,
    `query Workspace($team: String!) {
      team(id: $team) { states(filter: { type: { eq: "triage" } }) { nodes { id } } }
      issueLabels(filter: { name: { in: ["Bug", "Feedback"] } }) { nodes { id name team { id } } }
    }`,
    { team: teamId },
  )
  // A team's own label wins over a workspace label of the same name.
  const label = (name: string) => {
    const matches = data.issueLabels.nodes.filter((node) => node.name === name)
    return (matches.find((node) => node.team?.id === teamId) ?? matches.find((node) => !node.team))
      ?.id
  }
  return {
    teamId,
    triageStateId: data.team.states.nodes[0]?.id,
    labels: { bug: label("Bug"), feedback: label("Feedback") },
  }
}

function workspace(settings: LinearSettings) {
  const key = `${settings.apiKey}:${settings.team}`
  let pending = workspaces.get(key)
  if (!pending) {
    pending = lookUpWorkspace(settings)
    // A failed lookup is retried on the next report instead of being cached.
    pending.catch(() => workspaces.delete(key))
    workspaces.set(key, pending)
  }
  return pending
}

export function reportKey(source: string) {
  return createHash("sha256").update(source).digest("hex").slice(0, 16)
}

// Uploads a screenshot to Linear's storage and returns the address to embed in the issue.
export async function uploadToLinear(settings: LinearSettings, file: File): Promise<string> {
  const data = await request<{
    fileUpload: {
      uploadFile: { uploadUrl: string; assetUrl: string; headers: { key: string; value: string }[] }
    }
  }>(
    settings,
    `mutation Upload($contentType: String!, $filename: String!, $size: Int!) {
      fileUpload(contentType: $contentType, filename: $filename, size: $size) {
        uploadFile { uploadUrl assetUrl headers { key value } }
      }
    }`,
    { contentType: file.type, filename: file.name || "screenshot", size: file.size },
  )
  const { uploadUrl, assetUrl, headers } = data.fileUpload.uploadFile
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "content-type": file.type,
      "cache-control": "public, max-age=31536000",
      ...Object.fromEntries(headers.map((header) => [header.key, header.value])),
    },
    body: file,
    signal: AbortSignal.timeout(TIMEOUT_MS * 3),
  })
  if (!response.ok) throw new LinearError(`The screenshot upload failed (${response.status}).`)
  return assetUrl
}

const ISSUE_FIELDS = "id identifier url"

// Files one report. The key line in the body lets a repeat find the open issue it belongs to; a
// repeat becomes a comment there instead of a second issue.
export async function fileInLinear(
  settings: LinearSettings,
  report: {
    kind: "bug" | "feedback"
    title: string
    body: string
    key: string
  },
): Promise<FiledReport> {
  const space = await workspace(settings)
  const keyLine = `Report key: ${report.key}`

  const existing = await request<{ issues: { nodes: LinearIssue[] } }>(
    settings,
    `query Existing($team: ID!, $key: String!) {
      issues(
        first: 1
        filter: {
          team: { id: { eq: $team } }
          description: { contains: $key }
          state: { type: { nin: ["completed", "canceled", "duplicate"] } }
        }
      ) { nodes { ${ISSUE_FIELDS} } }
    }`,
    { team: space.teamId, key: keyLine },
  )
  const duplicate = existing.issues.nodes[0]
  if (duplicate) {
    await request(
      settings,
      "mutation Comment($input: CommentCreateInput!) { commentCreate(input: $input) { success } }",
      { input: { issueId: duplicate.id, body: `Reported again.\n\n${report.body}` } },
    )
    return { issue: duplicate, duplicate: true }
  }

  const labelId = space.labels[report.kind]
  const created = await request<{ issueCreate: { issue: LinearIssue } }>(
    settings,
    `mutation Create($input: IssueCreateInput!) {
      issueCreate(input: $input) { issue { ${ISSUE_FIELDS} } }
    }`,
    {
      input: {
        teamId: space.teamId,
        title: report.title,
        description: `${report.body}\n\n${keyLine}`,
        // Medium for bugs so they sort above untriaged ideas; feedback starts without a priority.
        priority: report.kind === "bug" ? 3 : 0,
        ...(labelId ? { labelIds: [labelId] } : {}),
        ...(settings.project ? { projectId: settings.project } : {}),
        ...(space.triageStateId ? { stateId: space.triageStateId } : {}),
      },
    },
  )
  return { issue: created.issueCreate.issue, duplicate: false }
}

// For tests: forget the cached team lookups.
export function resetLinearCache() {
  workspaces.clear()
}
