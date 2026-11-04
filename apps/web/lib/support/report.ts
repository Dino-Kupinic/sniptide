// What a bug report or a piece of feedback carries, shared by the dialog that collects it and the
// server that files it. Nothing here touches the network, so the browser and tests can use it.

export const REPORT_KINDS = ["bug", "feedback"] as const
export type ReportKind = (typeof REPORT_KINDS)[number]

export type InstanceType = "hosted" | "self-hosted"

// What the dialog needs to know about this instance, handed down from the app layout.
export interface SupportSettings {
  // "linear" files reports on the server; "link" opens the instance's help link instead.
  reports: "linear" | "link"
  assistant: boolean
  version: string
  instance: InstanceType
  userId: string
}

export const MAX_DESCRIPTION_LENGTH = 4000
export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024
export const SCREENSHOT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const

// Read in the browser when the dialog opens. The person sees every field before sending.
export interface ReportContext {
  url: string
  browser: string
  version: string
  userId: string
  instance: InstanceType
}

export function isHostedInstance(appUrl: string | undefined) {
  if (!appUrl) return false
  try {
    return new URL(appUrl).hostname === "app.sniptide.com"
  } catch {
    return false
  }
}

// Queries and fragments can hold search terms, tokens and secret-share keys, so only the origin
// and path leave the browser.
export function redactUrl(value: string) {
  try {
    const url = new URL(value)
    return `${url.origin}${url.pathname}`
  } catch {
    return ""
  }
}

// The route with its slugs taken out, so reports about the same screen group together:
// /pastes/k3j2h/edit becomes /pastes/:slug/edit.
const NAMED_SEGMENTS = new Set([
  "pastes",
  "collections",
  "settings",
  "secrets",
  "analytics",
  "dashboard",
  "starred",
  "shared",
  "trash",
  "new",
  "edit",
  "revisions",
])

export function routePattern(value: string) {
  let pathname: string
  try {
    pathname = new URL(value).pathname
  } catch {
    pathname = value
  }
  const segments = pathname.split("/").filter(Boolean)
  return `/${segments.map((segment) => (NAMED_SEGMENTS.has(segment) ? segment : ":slug")).join("/")}`
}

// The first line of the description, shortened, as the issue title.
export function reportTitle(kind: ReportKind, description: string) {
  const firstLine =
    description
      .trim()
      .split("\n")
      .find((line) => line.trim()) ?? ""
  const clean = firstLine.replace(/\s+/g, " ").trim()
  const short = clean.length > 80 ? `${clean.slice(0, 77).trimEnd()}...` : clean
  return `${kind === "bug" ? "Bug" : "Feedback"}: ${short || "No description"}`
}

// Two reports get the same key when they are the same kind, on the same screen, and start with
// the same words. It catches double submissions and the same problem reported twice; it does not
// recognize two different descriptions of one bug, which the weekly triage pass handles.
export function dedupeSource(kind: ReportKind, url: string, description: string) {
  const words = description
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .slice(0, 12)
    .join(" ")
  return `${kind}|${routePattern(url)}|${words}`
}

export function contextLines(context: ReportContext) {
  return [
    `URL: ${redactUrl(context.url) || "unknown"}`,
    `Browser: ${context.browser || "unknown"}`,
    `App version: ${context.version || "unknown"}`,
    `User ID: ${context.userId || "unknown"}`,
    `Instance: ${context.instance}`,
  ]
}

// The issue body: the person's words, then the context as a list.
export function reportMarkdown(input: {
  kind: ReportKind
  description: string
  context: ReportContext
  screenshotUrl?: string
}) {
  const parts = [
    input.description.trim(),
    "",
    "## Context",
    "",
    ...contextLines(input.context).map((line) => `- ${line}`),
  ]
  if (input.screenshotUrl)
    parts.push("", "## Screenshot", "", `![Screenshot](${input.screenshotUrl})`)
  return parts.join("\n")
}

// Without a tracker configured, the dialog opens a prefilled GitHub issue when the instance's help
// link points at GitHub issues, and returns null otherwise. GitHub refuses very long links.
export function githubDraftUrl(helpUrl: string, title: string, body: string): string | null {
  let help: URL
  try {
    help = new URL(helpUrl)
  } catch {
    return null
  }
  const match =
    help.hostname === "github.com" && help.pathname.match(/^\/([^/]+)\/([^/]+)\/issues\/?$/)
  if (!match) return null
  const url = new URL(`https://github.com/${match[1]}/${match[2]}/issues/new`)
  url.searchParams.set("title", title)
  url.searchParams.set("body", body)
  return url.href.length <= 7500 ? url.href : null
}
