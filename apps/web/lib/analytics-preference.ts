const storageKey = "sniptide.analytics.excluded"
const preferencePath = "/_site/analytics"

export type AnalyticsPreference = "included" | "excluded"
export type AnalyticsPreferenceState = AnalyticsPreference | "unavailable"

export function getAnalyticsPreference(): AnalyticsPreferenceState {
  try {
    return window.localStorage.getItem(storageKey) === "1" ? "excluded" : "included"
  } catch {
    return "unavailable"
  }
}

export function setAnalyticsPreference(preference: AnalyticsPreference): AnalyticsPreferenceState {
  try {
    if (preference === "excluded") window.localStorage.setItem(storageKey, "1")
    else window.localStorage.removeItem(storageKey)
    return getAnalyticsPreference() === preference ? preference : "unavailable"
  } catch {
    return "unavailable"
  }
}

export function isAnalyticsExcluded() {
  if (typeof window === "undefined") return true
  const pathname = window.location.pathname.replace(/%5f/gi, "_").replace(/\/$/, "")
  return pathname === preferencePath || getAnalyticsPreference() !== "included"
}
