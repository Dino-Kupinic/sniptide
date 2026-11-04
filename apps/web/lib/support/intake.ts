import "server-only"

import { getConfig } from "@/lib/config"
import { hit } from "@/lib/rate-limit"
import { HOUR_SECONDS } from "@/lib/time"
import { fileInLinear, type LinearIssue, reportKey, uploadToLinear } from "./linear"
import {
  dedupeSource,
  type ReportContext,
  type ReportKind,
  reportMarkdown,
  reportTitle,
} from "./report"

// Every report from one account, from the dialog and from the assistant together. Enough for a
// bad afternoon, too few to flood the triage queue.
export const REPORTS_PER_HOUR = 10

export type ReportResult =
  | { ok: true; issue: LinearIssue; duplicate: boolean }
  | { ok: false; reason: "not_configured" | "rate_limited" | "failed"; retryAfterSeconds?: number }

export function reportLimit(userId: string) {
  return { key: `support-report:${userId}`, max: REPORTS_PER_HOUR, windowSeconds: HOUR_SECONDS }
}

export async function submitReport(input: {
  kind: ReportKind
  description: string
  context: ReportContext
  screenshot?: File
  // Appended after the context, such as the assistant conversation that led to the report.
  appendix?: string
  // Tests replace the Postgres-backed limiter.
  limiter?: typeof hit
}): Promise<ReportResult> {
  const settings = getConfig().support.linear
  if (!settings) return { ok: false, reason: "not_configured" }

  const quota = await (input.limiter ?? hit)([reportLimit(input.context.userId)])
  if (!quota.allowed)
    return { ok: false, reason: "rate_limited", retryAfterSeconds: quota.retryAfterSeconds }

  try {
    // A failed upload still files the report; the text matters more than the picture.
    const screenshotUrl = input.screenshot
      ? await uploadToLinear(settings, input.screenshot).catch((error) => {
          console.error("support: screenshot upload failed", error)
          return undefined
        })
      : undefined
    const body = [
      reportMarkdown({ ...input, screenshotUrl }),
      ...(input.appendix ? ["", input.appendix] : []),
    ].join("\n")
    const filed = await fileInLinear(settings, {
      kind: input.kind,
      title: reportTitle(input.kind, input.description),
      body,
      key: reportKey(dedupeSource(input.kind, input.context.url, input.description)),
    })
    return { ok: true, ...filed }
  } catch (error) {
    console.error("support: filing the report in Linear failed", error)
    return { ok: false, reason: "failed" }
  }
}
