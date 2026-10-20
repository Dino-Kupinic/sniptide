// The docs are served from the root of their own domain (docs.sniptide.com).
export const docsRoute = "/"

export const gitHubUrl = "https://github.com/Dino-Kupinic/sniptide"

// Where the Sniptide app runs. The API reference is served by the app itself (/docs/api), so the
// nav links there. The pages are prerendered, so APP_URL is read when the site is built (a build
// argument in the Dockerfile), not when it starts.
const DEFAULT_APP_URL = "https://app.sniptide.com"

export function appUrl() {
  return (process.env.APP_URL?.trim() || DEFAULT_APP_URL).replace(/\/+$/, "")
}
