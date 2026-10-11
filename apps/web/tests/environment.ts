// Browser fixtures create and remove accounts. Only a dedicated local database is allowed.
export function databaseUrl() {
  const value = process.env.E2E_DATABASE_URL
  if (!value)
    throw new Error(
      "Set E2E_DATABASE_URL to a local database ending in _e2e (see tests/README.md).",
    )
  const url = new URL(value)
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !/^\/[a-zA-Z0-9_-]+_e2e$/.test(url.pathname)
  ) {
    throw new Error("E2E_DATABASE_URL must use a loopback host and a database name ending in _e2e.")
  }
  return value
}
