import { describe, expect, test } from "bun:test"
import {
  detectMac,
  formatShortcut,
  isPlainKey,
  type KeyEventLike,
  matchesCombo,
  SHORTCUTS,
  type Shortcut,
  shortcut,
  shortcutLabel,
} from "@/lib/shortcuts"

// The shortcut list and how key presses are matched against it.

function press(key: string, modifiers: Partial<Omit<KeyEventLike, "key">> = {}): KeyEventLike {
  return { key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...modifiers }
}

const all: readonly Shortcut[] = SHORTCUTS

describe("shortcut list", () => {
  test("ids are unique", () => {
    const ids = all.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test("no two shortcuts in the same place share keys", () => {
    // The command menu's own keys only apply while it is open, so they don't clash with the rest.
    const seen = new Map<string, string>()
    for (const item of all.filter((entry) => entry.group !== "menu")) {
      const signature = `${item.sequence ? "seq" : "combo"}:${item.keys.join("+")}`
      expect(seen.get(signature)).toBeUndefined()
      seen.set(signature, item.id)
    }
  })

  test("no shortcut takes a browser-reserved key", () => {
    // Pages can't claim these: ⌘N / ⌘T / ⌘W open and close windows and tabs.
    for (const item of all) {
      if (item.sequence || !item.keys.includes("mod")) continue
      expect(["n", "t", "w", "q", "r", "l"]).not.toContain(item.keys.at(-1) ?? "")
    }
  })
})

describe("matching key presses", () => {
  const redo = shortcut("redo").keys

  test("mod is Command or Control", () => {
    expect(matchesCombo(press("k", { metaKey: true }), ["mod", "k"])).toBe(true)
    expect(matchesCombo(press("k", { ctrlKey: true }), ["mod", "k"])).toBe(true)
    expect(matchesCombo(press("K", { metaKey: true }), ["mod", "k"])).toBe(true)
    expect(matchesCombo(press("k"), ["mod", "k"])).toBe(false)
  })

  test("undo and redo are told apart by Shift", () => {
    const undo = shortcut("undo").keys
    expect(matchesCombo(press("z", { metaKey: true }), undo)).toBe(true)
    expect(matchesCombo(press("Z", { metaKey: true, shiftKey: true }), undo)).toBe(false)
    expect(matchesCombo(press("Z", { metaKey: true, shiftKey: true }), redo)).toBe(true)
    expect(matchesCombo(press("z", { metaKey: true }), redo)).toBe(false)
  })

  test("extra modifiers never match, so AltGr combos stay out of it", () => {
    expect(matchesCombo(press("s", { ctrlKey: true, altKey: true }), ["mod", "s"])).toBe(false)
    expect(matchesCombo(press("Enter", { metaKey: true }), shortcut("submit").keys)).toBe(true)
    expect(matchesCombo(press("Enter"), shortcut("submit").keys)).toBe(false)
  })

  test("a plain key is only itself, with no modifier held", () => {
    expect(isPlainKey(press("n"), "n")).toBe(true)
    expect(isPlainKey(press("N", { shiftKey: true }), "n")).toBe(false)
    expect(isPlainKey(press("n", { metaKey: true }), "n")).toBe(false)
    expect(isPlainKey(press("n", { altKey: true }), "n")).toBe(false)
  })

  test("/ and ? work however the layout reaches them", () => {
    // / is Shift+7 on a German keyboard; ? is Shift+/ on a US one.
    expect(isPlainKey(press("/"), "/")).toBe(true)
    expect(isPlainKey(press("/", { shiftKey: true }), "/")).toBe(true)
    expect(isPlainKey(press("?", { shiftKey: true }), "?")).toBe(true)
    expect(isPlainKey(press("?"), "?")).toBe(true)
    expect(isPlainKey(press("/", { ctrlKey: true }), "/")).toBe(false)
  })
})

describe("key labels", () => {
  test("a Mac gets symbols and Windows gets names", () => {
    expect(formatShortcut(shortcut("command-menu"), true)).toEqual(["⌘K"])
    expect(formatShortcut(shortcut("command-menu"), false)).toEqual(["Ctrl+K"])
    expect(formatShortcut(shortcut("redo"), true)).toEqual(["⌘⇧Z"])
    expect(formatShortcut(shortcut("redo"), false)).toEqual(["Ctrl+Shift+Z"])
    expect(formatShortcut(shortcut("submit"), true)).toEqual(["⌘↵"])
    expect(formatShortcut(shortcut("submit"), false)).toEqual(["Ctrl+↵"])
  })

  test("single keys and sequences look the same everywhere", () => {
    expect(formatShortcut(shortcut("new-paste"), true)).toEqual(["N"])
    expect(formatShortcut(shortcut("search"), false)).toEqual(["/"])
    expect(formatShortcut(shortcut("help"), false)).toEqual(["?"])
    expect(formatShortcut(shortcut("go-trash"), false)).toEqual(["G", "T"])
  })

  test("plain text joins a sequence with then", () => {
    expect(shortcutLabel(shortcut("go-dashboard"), true)).toBe("G then D")
    expect(shortcutLabel(shortcut("toggle-sidebar"), true)).toBe("⌘B")
  })

  test("only Apple platforms are Macs", () => {
    expect(detectMac("MacIntel")).toBe(true)
    expect(detectMac("macOS")).toBe(true)
    expect(detectMac("iPhone")).toBe(true)
    expect(detectMac("Win32")).toBe(false)
    expect(detectMac("Linux x86_64")).toBe(false)
    expect(detectMac(undefined)).toBe(false)
  })
})
