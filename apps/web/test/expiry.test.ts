import { describe, expect, test } from "bun:test"
import { expiresAtFor } from "@/lib/pastes/store"
import { HOUR } from "@/lib/time"

describe("paste expiry", () => {
  test("adds an elapsed hour at 23:33 across local midnight", () => {
    const now = Date.parse("2026-10-29T23:33:00+01:00")
    expect(expiresAtFor("1h", now)).toBe(Date.parse("2026-10-30T00:33:00+01:00"))
  })

  test("adds an elapsed hour across a daylight saving change", () => {
    const now = Date.parse("2026-10-25T02:33:00+02:00")
    expect(expiresAtFor("1h", now)).toBe(Date.parse("2026-10-25T02:33:00+01:00"))
  })

  test("starts each new selection from now and supports removing expiry", () => {
    const now = Date.parse("2026-10-29T22:33:00Z")
    expect(expiresAtFor("1h", now + 10_000)).toBe(now + 10_000 + HOUR)
    expect(expiresAtFor("never", now)).toBeNull()
  })
})
