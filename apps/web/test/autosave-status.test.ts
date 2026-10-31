import { describe, expect, test } from "bun:test"
import { createTranslator } from "next-intl"
import { autosaveLabel } from "@/components/autosave-status"
import type { AutosaveState } from "@/lib/autosave/autosaver"
import de from "@/messages/de/core.json"

describe("autosave status", () => {
  test("ages the saved label using the successful save time", () => {
    const state: AutosaveState = { kind: "saved", at: 1000 }
    expect(autosaveLabel(state, undefined, 1000)).toBe("Saved just now")
    expect(autosaveLabel(state, undefined, 60_999)).toBe("Saved just now")
    expect(autosaveLabel(state, undefined, 61_000)).toBe("Saved 1 min ago")
    expect(autosaveLabel(state, undefined, 121_000)).toBe("Saved 2 min ago")
    expect(autosaveLabel(state, undefined, 3_601_000)).toBe("Saved 1 hour ago")
  })

  test("formats the complete saved sentence in the selected locale", () => {
    const t = createTranslator({ locale: "de", messages: de, namespace: "Core" })
    expect(autosaveLabel({ kind: "saved", at: 1000 }, t, 121_000, "de")).toBe(
      "Gespeichert vor 2 Minuten",
    )
  })

  test("keeps offline, retry, error and conflict messages", () => {
    expect(autosaveLabel({ kind: "retrying", attempt: 1, offline: true })).toBe(
      "Offline. Changes are kept on this device",
    )
    expect(autosaveLabel({ kind: "retrying", attempt: 1, offline: false })).not.toContain("Saved")
    expect(autosaveLabel({ kind: "error", message: "refused" })).toContain("refused")
    expect(autosaveLabel({ kind: "conflict" })).not.toContain("Saved")
  })
})
