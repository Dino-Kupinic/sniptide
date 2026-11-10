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

export type AnalyticsConfig = { key: string; uiHost: string; country?: string | null }

// PostHog removes the IP from cookieless events before its GeoIP lookup runs, so those events
// would have no location. The server passes the country its CDN reported (app/api/analytics), and
// this adds it under PostHog's own GeoIP property names so web analytics and breakdowns use it.
// Only the country is sent, never an address or a city. Events with consent keep PostHog's lookup.
export function withCountry(
  properties: Record<string, unknown>,
  country: string | null | undefined,
) {
  if (!country || properties.$cookieless_mode !== true || properties.$geoip_country_code) return
  properties.$geoip_country_code = country
  try {
    const name = new Intl.DisplayNames(["en"], { type: "region" }).of(country)
    if (name && name !== country) properties.$geoip_country_name = name
  } catch {
    // An unknown region code still records the code.
  }
}

let client: PostHog | undefined
let starting: Promise<void> | undefined
let syncConsent: (() => void) | undefined

const sdkConsentKey = "sniptide.analytics.sdk-consent"

function readMarketingVisitor(key: string) {
  try {
    const cookies = document.cookie.split(/;\s*/)
    const consent = cookies.find((cookie) => cookie.startsWith("sniptide_consent="))
    if (!/^sniptide_consent=(analytics|analytics\.replay|granted)$/.test(consent ?? "")) return

    // PostHog's cross-subdomain cookie contains the anonymous ID. The app reads it into
    // memory so app activity never writes properties back to the marketing cookie.
    const prefix = `ph_${key}_posthog=`
    const identity = cookies.find((cookie) => cookie.startsWith(prefix))
    if (!identity) return
    const { distinct_id: id } = JSON.parse(decodeURIComponent(identity.slice(prefix.length)))
    if (typeof id === "string" && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)) return id
  } catch {
    // Blocked storage or an invalid cookie leaves the app cookieless.
  }
}

export async function startAnalytics({ key, uiHost, country }: AnalyticsConfig) {
  if (client || isAnalyticsExcluded()) return
  if (starting) return starting
  starting = import("posthog-js").then(({ default: posthog }) => {
    if (isAnalyticsExcluded()) return
    let canShareConsent = window.location.origin === "https://app.sniptide.com"
    let visitorId = canShareConsent ? readMarketingVisitor(key) : undefined
    if (canShareConsent && !visitorId) {
      try {
        window.localStorage.removeItem(sdkConsentKey)
      } catch {
        canShareConsent = false
      }
    }
    posthog.init(key, {
      api_host: ANALYTICS_PATH,
      ui_host: uiHost,
      defaults: "2026-08-30",
      cookieless_mode: canShareConsent ? "on_reject" : "always",
      opt_out_capturing_by_default: true,
      consent_persistence_name: sdkConsentKey,
      opt_out_capturing_persistence_type: "localStorage",
      persistence: "memory",
      disable_persistence: true,
      get_device_id: (generated) => visitorId ?? generated,
      person_profiles: "never",
      // Explicit events only: autocapture and replay would record what's on screen, pastes included.
      autocapture: false,
      rageclick: false,
      capture_heatmaps: false,
      capture_dead_clicks: false,
      capture_exceptions: false,
      capture_performance: { web_vitals: false },
      disable_session_recording: true,
      disable_surveys: true,
      advanced_disable_flags: true,
      mask_all_text: true,
      mask_all_element_attributes: true,
      before_send: (event) => {
        if (
          !event ||
          isAnalyticsExcluded() ||
          (canShareConsent &&
            event.properties.$cookieless_mode !== true &&
            (!visitorId ||
              visitorId !== readMarketingVisitor(key) ||
              event.properties.distinct_id !== visitorId)) ||
          shouldDropSecretEvent(
            event,
            typeof window === "undefined" ? "" : window.location.pathname,
          )
        )
          return null
        event.properties.surface = "app"
        withCountry(event.properties, country)
        scrubProperties(event.properties)
        scrubProperties(event.$set)
        scrubProperties(event.$set_once)
        return event
      },
    })
    if (canShareConsent) {
      syncConsent = () => {
        const next = isAnalyticsExcluded() ? undefined : readMarketingVisitor(key)
        if (posthog.get_explicit_consent_status() === "granted") {
          if (next === visitorId) return
          // The SDK clears the old identity and tears down its session when opting out.
          visitorId = undefined
          posthog.opt_out_capturing()
          posthog.clear_opt_in_out_capturing()
        }
        visitorId = next
        if (next) posthog.opt_in_capturing({ captureEventName: false })
      }
      syncConsent()
      window.addEventListener("focus", syncConsent)
      window.addEventListener("pageshow", syncConsent)
    }
    client = posthog
  })
  try {
    await starting
  } finally {
    starting = undefined
  }
}

export function track(event: string, properties?: Record<string, string | number | boolean>) {
  syncConsent?.()
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
  "oauth",
  "pastes",
  "settings",
  "shared",
  "starred",
  "trash",
  "collections",
  "secrets",
  "secret-share",
  "welcome",
])

const SHARE_ACTIONS = new Set(["copy", "embed", "preview", "print", "raw", "reveal", "unlock"])
const isHandle = (segment: string) => /^(?:@|%40)/i.test(segment)

// Keep the route shape while removing generated slugs, handles and custom link names.
export function scrubPath(pathname: string) {
  const [, first = "", second, ...rest] = pathname.split("/")
  if (first === "secret-share") return second ? "/secret-share/[token]" : "/secret-share"
  if (first === "secrets") return second ? "/secrets/[id]" : "/secrets"
  if (isHandle(first)) {
    const action = rest[0]
    if (!second) return "/@[handle]"
    return action && SHARE_ACTIONS.has(action) ? `/@[handle]/[slug]/${action}` : "/@[handle]/[slug]"
  }
  if (first === "pastes" && second && isHandle(second)) {
    return rest[1] === "edit" ? "/pastes/@[handle]/[slug]/edit" : "/pastes/@[handle]/[slug]"
  }
  if (!SECTIONS.has(first))
    return second && SHARE_ACTIONS.has(second) ? `/[slug]/${second}` : "/[slug]"
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
