export function validateTestDatabaseUrl(value: string): string {
  const invalid = () =>
    new Error(
      "TEST_DATABASE_URL must be a PostgreSQL URL for a single database named *_test, without target overrides or fragments.",
    )
  let url: URL
  const hasControl = (text: string) =>
    [...text].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  try {
    url = new URL(value)
    if (
      hasControl(value) ||
      hasControl(decodeURIComponent(url.username)) ||
      hasControl(decodeURIComponent(url.password))
    )
      throw invalid()
  } catch {
    throw invalid()
  }
  if (
    value !== value.trim() ||
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    /[%,]/.test(url.hostname) ||
    !/^\/[A-Za-z0-9_-]+_test$/.test(url.pathname) ||
    url.hash ||
    value.includes("#")
  )
    throw invalid()
  // postgres.js forwards unknown query keys as startup parameters. A database override there
  // must not replace the pathname we validated. Keep ordinary SSL and timeout options usable.
  const overrides = new Set(["database", "db", "dbname", "host", "hostname", "port", "path"])
  for (const [key, parameter] of url.searchParams) {
    if (overrides.has(key.toLowerCase()) || hasControl(key) || hasControl(parameter))
      throw invalid()
  }
  return value
}
