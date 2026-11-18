import "server-only"

import { isAnalyticsHost } from "@/lib/analytics-proxy"
import { getConfig } from "@/lib/config"
import { toExceptionList } from "@/lib/error-scrub"
import { deploymentVersion } from "@/lib/support/server"

// Server exceptions go to PostHog error tracking, in the same project as product analytics. Off
// unless POSTHOG_KEY is set, so a self-hosted instance sends no exceptions without a key.
// Preview deployments and
// local development stay quiet for the same reason as their analytics (isAnalyticsHost).
//
// Events carry the scrubbed exception (lib/error-scrub.ts) and a fixed set of tags: the route
// file (app/[slug]/page, never the visited path), the release and the runtime. They never carry
// the request's path, query, headers or body.

export type ErrorSource =
  | { source: "request"; route: string; routeType: string; method: string; host?: string }
  | { source: "job"; job: string }

// A failure loop must not flood PostHog or hold up the server, so each process sends at most
// this many exceptions a minute and gives up on PostHog after a few seconds.
const PER_MINUTE = 30
const TIMEOUT_MS = 3000
const state = globalThis as typeof globalThis & {
  __sniptideErrorBudget?: { windowStart: number; sent: number }
}

function withinBudget(now: number) {
  state.__sniptideErrorBudget ??= { windowStart: now, sent: 0 }
  const budget = state.__sniptideErrorBudget
  if (now - budget.windowStart >= 60_000) {
    budget.windowStart = now
    budget.sent = 0
  }
  if (budget.sent >= PER_MINUTE) return false
  budget.sent++
  return true
}

function canReport(source: ErrorSource) {
  if (source.source === "request") return !source.host || isAnalyticsHost(source.host)
  const appUrl = getConfig().appUrl
  if (!appUrl) return true
  try {
    return isAnalyticsHost(new URL(appUrl).hostname)
  } catch {
    return true
  }
}

export function exceptionEvent(error: unknown, source: ErrorSource, key: string, now = new Date()) {
  const digest =
    typeof error === "object" && error && "digest" in error && typeof error.digest === "string"
      ? error.digest.slice(0, 64)
      : undefined
  const tags =
    source.source === "request"
      ? { route: source.route, route_type: source.routeType, method: source.method }
      : { job: source.job }
  return {
    api_key: key,
    event: "$exception",
    distinct_id: "sniptide-server",
    timestamp: now.toISOString(),
    properties: {
      $exception_list: toExceptionList(
        error,
        source.source === "request" ? "onRequestError" : "maintenance_job",
      ),
      $exception_level: "error",
      $process_person_profile: false,
      $lib: "sniptide-server",
      surface: "server",
      source: source.source,
      release: deploymentVersion(),
      runtime: process.env.NEXT_RUNTIME || "nodejs",
      ...tags,
      ...(digest ? { digest } : {}),
    },
  }
}

// Sends one exception. Never throws, so callers can await it inside their own error handling.
export async function captureServerError(error: unknown, source: ErrorSource) {
  try {
    const analytics = getConfig().analytics
    if (!analytics || !canReport(source) || !withinBudget(Date.now())) return
    await fetch(`${analytics.host}/i/v0/e/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(exceptionEvent(error, source, analytics.key)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    // Reporting is best effort; the server log still has the error.
  }
}

// Clears the per-minute budget between tests.
export function resetErrorBudget() {
  state.__sniptideErrorBudget = undefined
}
