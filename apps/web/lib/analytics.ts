import type { PostHog } from "posthog-js"
import { isAnalyticsExcluded } from "@/lib/analytics-preference"

// Product analytics with PostHog. Off unless the server has POSTHOG_KEY (lib/config.ts), so a
// self-hosted instance sends nothing. sniptide.com reports to the same project as its website;
// events from here carry surface=app.
//
// Events never hold paste content, titles, file names or slugs: only the counts and settings
// passed to `track`, and URLs reduced to their route (scrubUrl).

// Same-origin path PostHog talks to; app/api/analytics forwards it to the PostHog region.
export const ANALYTICS_PATH = "/api/analytics"

export type AnalyticsConfig = { key: string; uiHost: string }

let client: PostHog | undefined
let starting: Promise<void> | undefined

export async function startAnalytics({ key, uiHost }: AnalyticsConfig) {
  if (client || isAnalyticsExcluded()) return
  if (starting) return starting
  starting = import("posthog-js").then(({ default: posthog }) => {
    if (isAnalyticsExcluded()) return
    posthog.init(key, {
      api_host: ANALYTICS_PATH,
      ui_host: uiHost,
      defaults: "2026-08-30",
      // No cookies or browser storage, so no consent banner. Needs cookieless mode on in the
      // PostHog project.
      cookieless_mode: "always",
      // Explicit events only: autocapture and replay would record what's on screen, pastes included.
      autocapture: false,
      disable_session_recording: true,
      disable_surveys: true,
      mask_all_text: true,
      mask_all_element_attributes: true,
      before_send: (event) => {
        if (
          !event ||
          isAnalyticsExcluded() ||
          shouldDropSecretEvent(
            event,
            typeof window === "undefined" ? "" : window.location.pathname,
          )
        )
          return null
        scrubProperties(event.properties)
        scrubProperties(event.$set)
        scrubProperties(event.$set_once)
        return event
      },
    })
    posthog.register({ surface: "app" })
    client = posthog
  })
  try {
    await starting
  } finally {
    starting = undefined
  }
}

export function track(event: string, properties?: Record<string, string | number | boolean>) {
  if (!isAnalyticsExcluded()) client?.capture(event, properties)
}

// Social sign-in leaves the page, so the return URL says what just happened: the provider
// redirects new accounts to `newUserCallbackURL` and everyone else to `callbackURL`, and each
// carries `?auth=<event>&method=<provider>`. `consumeAuthMarker` reports it once and strips it.
const AUTH_EVENTS = ["signed_up", "signed_in"] as const
const AUTH_METHODS = ["github", "google"] as const
type AuthEvent = (typeof AUTH_EVENTS)[number]

export function withAuthMarker(path: string, event: AuthEvent, method: string) {
  const marker = new URLSearchParams({ auth: event, method })
  return `${path}${path.includes("?") ? "&" : "?"}${marker}`
}

// Returns the event to report and the URL without the marker, or null when there is none. The
// event and method are checked against fixed lists, so a crafted link can't send anything else.
export function readAuthMarker(href: string) {
  const url = new URL(href)
  const event = AUTH_EVENTS.find((name) => name === url.searchParams.get("auth"))
  const method = AUTH_METHODS.find((name) => name === url.searchParams.get("method"))
  if (!event || !method) return null
  url.searchParams.delete("auth")
  url.searchParams.delete("method")
  return { event, method, cleanUrl: `${url.pathname}${url.search}${url.hash}` }
}

// Reports a social sign-up or sign-in once, then removes the marker so a refresh doesn't repeat it.
export function consumeAuthMarker() {
  const marker = readAuthMarker(window.location.href)
  if (!marker) return
  window.history.replaceState(window.history.state, "", marker.cleanUrl)
  track(marker.event, { method: marker.method })
}

// The app's own sections; any other first segment is a share link (/<slug>, /<slug>/raw).
const SECTIONS = new Set([
  "",
  "api",
  "sign-in",
  "sign-up",
  "dashboard",
  "new",
  "pastes",
  "settings",
  "shared",
  "starred",
  "trash",
  "collections",
  "secrets",
  "secret-share",
])

// "/k7Qe2x/raw" -> "/[slug]/raw", "/pastes/k7Qe2x/edit" -> "/pastes/[slug]/edit".
export function scrubPath(pathname: string) {
  const [, first = "", second, ...rest] = pathname.split("/")
  if (first === "secret-share") return second ? "/secret-share/[token]" : "/secret-share"
  if (first === "secrets") return second ? "/secrets/[id]" : "/secrets"
  if (!SECTIONS.has(first)) return second ? `/[slug]/${second}` : "/[slug]"
  if ((first === "pastes" || first === "collections") && second) {
    return ["", first, "[slug]", ...rest].join("/")
  }
  return pathname
}

// Keeps the origin and the route; drops slugs, query strings and fragments.
export function scrubUrl(value: string) {
  try {
    const url = new URL(value)
    return `${url.origin}${scrubPath(url.pathname)}`
  } catch {
    return value.startsWith("/") ? scrubPath(value.split(/[?#]/)[0] ?? "/") : value
  }
}

function scrubProperties(properties: Record<string, unknown> | undefined) {
  if (!properties) return
  for (const [name, value] of Object.entries(properties)) {
    if (typeof value === "string" && /url|pathname|referrer/i.test(name) && value !== "$direct") {
      properties[name] = scrubUrl(value)
    }
  }
}

export function isSecretPath(value: string) {
  try {
    const path = new URL(value, "https://analytics.invalid").pathname
    return /^\/(?:secrets|secret-share)(?:\/|$)/.test(path)
  } catch {
    return /\/(?:secrets|secret-share)(?:\/|$)/.test(value)
  }
}
export function shouldDropSecretEvent(
  event: {
    properties?: Record<string, unknown>
    $set?: Record<string, unknown>
    $set_once?: Record<string, unknown>
  },
  pathname: string,
) {
  if (isSecretPath(pathname)) return true
  return [event.properties, event.$set, event.$set_once].some(
    (properties) =>
      properties &&
      Object.entries(properties).some(
        ([key, value]) =>
          typeof value === "string" && /url|pathname|referrer/i.test(key) && isSecretPath(value),
      ),
  )
}
