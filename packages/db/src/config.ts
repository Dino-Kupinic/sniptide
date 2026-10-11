// Reject invalid limits at startup rather than silently using an unlimited budget.
export function envInteger(name: string, fallback: number, min: number, max: number) {
  const value = process.env[name]
  if (value === undefined || value === "") return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max)
    throw new Error(`${name} must be an integer between ${min} and ${max}`)
  return parsed
}
