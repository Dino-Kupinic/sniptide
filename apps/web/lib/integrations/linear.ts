import "server-only"

import { z } from "zod"
import { getConfig } from "@/lib/config"
import type { ExportDestination, ExportPaste, Failure, IntegrationProvider } from "./types"

// Linear: attaching a paste to an issue. The paste shows in the issue's attachments with its
// title and language, and attaching the same paste twice updates the one attachment, because
// Linear keys attachments by URL within an issue.

const API = "https://api.linear.app/graphql"
const ISSUE_COUNT = 100

const UNAVAILABLE: Failure = { ok: false, error: "Linear didn't answer. Try again in a minute." }
const NO_ISSUE: Failure = {
  ok: false,
  error: "Linear couldn't find that issue. Pick another one and try again.",
}
const DISCONNECTED: Failure = {
  ok: false,
  error: "That connection stopped working. Connect it again in Settings.",
  unauthorized: true,
}

const answerSchema = z.object({
  data: z.unknown().optional(),
  errors: z
    .array(
      z.object({
        message: z.string().optional(),
        extensions: z
          .object({ code: z.string().optional(), type: z.string().optional() })
          .optional(),
      }),
    )
    .optional(),
})

const issuesSchema = z.object({
  issues: z.object({
    nodes: z.array(
      z.object({
        id: z.string(),
        identifier: z.string(),
        title: z.string(),
        team: z.object({ private: z.boolean().optional() }).nullish(),
      }),
    ),
  }),
})

const viewerSchema = z.object({
  viewer: z.object({ id: z.string(), organization: z.object({ name: z.string() }) }),
})

const attachSchema = z.object({ attachmentCreate: z.object({ success: z.boolean() }) })

async function query(
  token: string,
  text: string,
  variables: Record<string, unknown> = {},
): Promise<{ ok: true; data: unknown } | Failure> {
  const response = await fetch(API, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query: text, variables }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  }).catch(() => null)
  if (!response) return UNAVAILABLE
  if (response.status === 401) return DISCONNECTED
  const answer = answerSchema.safeParse(await response.json().catch(() => null))
  if (!answer.success) return UNAVAILABLE
  const error = answer.data.errors?.[0]
  if (error) {
    // Linear names the kind both ways, such as type "invalid input" and code "INVALID_INPUT".
    const code = `${error.extensions?.code ?? ""} ${error.extensions?.type ?? ""}`
      .toLowerCase()
      .replaceAll("_", " ")
    if (code.includes("authentication")) return DISCONNECTED
    if (code.includes("entity not found") || code.includes("invalid input")) return NO_ISSUE
    return UNAVAILABLE
  }
  if (!response.ok || answer.data.data === undefined) return UNAVAILABLE
  return { ok: true, data: answer.data.data }
}

// The open issues the user is assigned to or created, most recently updated first, which covers
// the issue a paste usually belongs to without paging through the whole workspace.
const ISSUES = `query SniptideIssues($first: Int!) {
  issues(
    first: $first
    orderBy: updatedAt
    filter: {
      or: [{ assignee: { isMe: { eq: true } } }, { creator: { isMe: { eq: true } } }]
      state: { type: { nin: ["completed", "canceled"] } }
    }
  ) {
    nodes { id identifier title team { private } }
  }
}`

async function destinations(
  token: string,
): Promise<{ ok: true; destinations: ExportDestination[] } | Failure> {
  const result = await query(token, ISSUES, { first: ISSUE_COUNT })
  if (!result.ok) return result
  const parsed = issuesSchema.safeParse(result.data)
  if (!parsed.success) return UNAVAILABLE
  return {
    ok: true,
    destinations: parsed.data.issues.nodes.map((issue) => ({
      id: issue.id,
      name: issue.title,
      detail: issue.identifier,
      private: issue.team?.private ?? false,
    })),
  }
}

// The attachment Linear shows. A link-only paste gets a generic title, because its own title may
// be as private as its content.
export function linearAttachment(issueId: string, paste: ExportPaste) {
  return {
    issueId,
    url: paste.url,
    title: paste.title || "Sniptide paste",
    ...(paste.language ? { subtitle: paste.language } : {}),
    iconUrl: `${new URL(paste.url).origin}/web-app-manifest-192x192.png`,
  }
}

const ATTACH = `mutation SniptideAttach($input: AttachmentCreateInput!) {
  attachmentCreate(input: $input) { success }
}`

export const linear: IntegrationProvider = {
  id: "linear",
  name: "Linear",
  oauth: {
    authorizeUrl: "https://linear.app/oauth/authorize",
    tokenUrl: "https://api.linear.app/oauth/token",
    // read lists the user's issues. issues:create covers creating attachments on them.
    scopes: ["read", "issues:create"],
    scopeSeparator: ",",
    credentials: () => getConfig().linear ?? null,
  },
  async account(token) {
    const result = await query(token, "query { viewer { id organization { name } } }")
    if (!result.ok) return null
    const viewer = viewerSchema.safeParse(result.data)
    return viewer.success
      ? { id: viewer.data.viewer.id, name: viewer.data.viewer.organization.name }
      : null
  },
  async revoke(token) {
    await fetch("https://api.linear.app/oauth/revoke", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null)
  },
  exports: {
    kind: "issue",
    destinations,
    async send(token, destination, paste) {
      const result = await query(token, ATTACH, { input: linearAttachment(destination, paste) })
      if (!result.ok) return result
      const parsed = attachSchema.safeParse(result.data)
      return parsed.success && parsed.data.attachmentCreate.success ? { ok: true } : UNAVAILABLE
    },
  },
}
