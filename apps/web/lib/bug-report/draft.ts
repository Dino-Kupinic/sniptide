export interface ReportContext {
  url: string
  browser: string
  version: string
  userId: string
  instance: "hosted" | "self-hosted"
}

export function buildReportDiagnostics(context: ReportContext): string {
  const url = new URL(context.url)
  // Queries and fragments can contain credentials, search terms and secret-share keys.
  return [
    "## Context",
    "",
    `URL: ${url.origin}${url.pathname}`,
    `Browser: ${context.browser}`,
    `App version: ${context.version}`,
    `User ID: ${context.userId}`,
    `Instance: ${context.instance}`,
  ].join("\n")
}

export function reportIssueUrl(body: string): string | null {
  if (!body.trim()) return null
  const url = new URL("https://github.com/Dino-Kupinic/sniptide/issues/new")
  url.searchParams.set("title", "Bug report / feedback")
  url.searchParams.set("body", body)
  // Keep the draft within GitHub's URL limit, including percent-encoded Unicode.
  return url.href.length <= 7500 ? url.href : null
}
