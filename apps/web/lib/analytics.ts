import posthog from "posthog-js"

// Product analytics with PostHog. Off unless the server has POSTHOG_KEY (lib/config.ts), so a
// self-hosted instance sends nothing. sniptide.com reports to the same project as its website;
// events from here carry surface=app.
//
// Events never hold paste content, titles, file names or slugs: only the counts and settings
// passed to `track`, and URLs reduced to their route (scrubUrl).

// Same-origin path PostHog talks to; app/api/analytics forwards it to the PostHog region.
export const ANALYTICS_PATH = "/api/analytics"

export type AnalyticsConfig = { key: string; uiHost: string }

let started = false

export function startAnalytics({ key, uiHost }: AnalyticsConfig) {
  if (started) return
  started = true
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
      if (!event) return null
      scrubProperties(event.properties)
      scrubProperties(event.$set)
      scrubProperties(event.$set_once)
      return event
    },
  })
  posthog.register({ surface: "app" })
}

export function track(event: string, properties?: Record<string, string | number | boolean>) {
  if (started) posthog.capture(event, properties)
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
])

// "/k7Qe2x/raw" -> "/[slug]/raw", "/pastes/k7Qe2x/edit" -> "/pastes/[slug]/edit".
export function scrubPath(pathname: string) {
  const [, first = "", second, ...rest] = pathname.split("/")
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
