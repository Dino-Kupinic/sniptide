const labels = ["Too short", "Weak", "Fair", "Good", "Strong"] as const

// A rough 0–4 score for the sign-up meter: length first, then mixed case, a digit and a symbol.
// better-auth enforces the real minimum (8 characters) on the server.
export function passwordStrength(password: string) {
  const checks = [
    { ok: /[^A-Za-z0-9]/.test(password), hint: "Add a symbol" },
    { ok: /\d/.test(password), hint: "Add a number" },
    { ok: /[a-z]/.test(password) && /[A-Z]/.test(password), hint: "Mix upper and lower case" },
  ]
  const long = password.length >= 8
  const score = long ? 1 + checks.filter((check) => check.ok).length : 0
  const hint = long ? checks.find((check) => !check.ok)?.hint : "Use at least 8 characters"

  return { score, label: labels[score], hint }
}
