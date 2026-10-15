// Every keyboard shortcut in the app, in one list. The help sheet, the ⌘K menu rows and the key
// labels all read from here, so a shortcut is described once. The handlers themselves live next to
// what they control (the command menu, the shell, the editor), and match with `matchesCombo`.

export type ShortcutGroup = "general" | "navigation" | "editor" | "menu"

export interface Shortcut {
  id: string
  label: string
  group: ShortcutGroup
  // A combo is pressed together ("mod", "k"); a sequence is pressed one after the other ("g", "d").
  keys: readonly string[]
  sequence?: boolean
}

export const SHORTCUT_GROUPS: { id: ShortcutGroup; title: string }[] = [
  { id: "general", title: "General" },
  { id: "navigation", title: "Go to" },
  { id: "editor", title: "Editor" },
  { id: "menu", title: "Command menu" },
]

export const SHORTCUTS = [
  { id: "command-menu", label: "Open the command menu", group: "general", keys: ["mod", "k"] },
  { id: "search", label: "Search", group: "general", keys: ["/"] },
  { id: "new-paste", label: "New paste", group: "general", keys: ["n"] },
  { id: "toggle-theme", label: "Toggle theme", group: "general", keys: ["d"] },
  { id: "toggle-sidebar", label: "Show or hide the sidebar", group: "general", keys: ["mod", "b"] },
  { id: "settings", label: "Settings", group: "general", keys: ["mod", ","] },
  { id: "help", label: "Keyboard shortcuts", group: "general", keys: ["?"] },

  { id: "go-dashboard", label: "Dashboard", group: "navigation", keys: ["g", "d"], sequence: true },
  { id: "go-starred", label: "Starred", group: "navigation", keys: ["g", "s"], sequence: true },
  { id: "go-trash", label: "Trash", group: "navigation", keys: ["g", "t"], sequence: true },

  {
    id: "submit",
    label: "Create the paste or finish editing",
    group: "editor",
    keys: ["mod", "enter"],
  },
  { id: "save", label: "Save now", group: "editor", keys: ["mod", "s"] },
  { id: "undo", label: "Undo", group: "editor", keys: ["mod", "z"] },
  { id: "redo", label: "Redo", group: "editor", keys: ["mod", "shift", "z"] },
  { id: "indent", label: "Indent", group: "editor", keys: ["tab"] },

  {
    id: "menu-navigate",
    label: "Move through results",
    group: "menu",
    keys: ["↑", "↓"],
    sequence: true,
  },
  { id: "menu-open", label: "Open", group: "menu", keys: ["enter"] },
  { id: "menu-new-tab", label: "Open in a new tab", group: "menu", keys: ["mod", "enter"] },
  { id: "menu-close", label: "Close", group: "menu", keys: ["esc"] },
] as const satisfies readonly Shortcut[]

export type ShortcutId = (typeof SHORTCUTS)[number]["id"]

export function shortcut(id: ShortcutId): Shortcut {
  const found = SHORTCUTS.find((item) => item.id === id)
  if (!found) throw new Error(`Unknown shortcut: ${id}`)
  return found
}

export interface KeyEventLike {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

const MODIFIERS = new Set(["mod", "shift", "alt"])
// Keys that sit behind Shift on some layouts (/ is Shift+7 on a German keyboard), so Shift can't
// be part of telling them apart.
const SHIFT_AGNOSTIC = new Set(["/", "?", ","])

// Whether a key press is exactly this combo. "mod" is ⌘ on a Mac and Ctrl elsewhere, and both are
// accepted anywhere so an external keyboard on a Mac still works. Extra modifiers don't match, so
// ⌘⇧Z is redo and never undo, and AltGr combos (Ctrl+Alt) never trigger a shortcut.
export function matchesCombo(event: KeyEventLike, keys: readonly string[]): boolean {
  const key = keys.find((item) => !MODIFIERS.has(item))
  if (!key) return false
  if ((event.metaKey || event.ctrlKey) !== keys.includes("mod")) return false
  if (event.altKey !== keys.includes("alt")) return false
  if (event.key.toLowerCase() !== key) return false
  return SHIFT_AGNOSTIC.has(key) || event.shiftKey === keys.includes("shift")
}

// A single key with no modifier at all (n, /, ?), the kind that must stay out of the way of typing.
export function isPlainKey(event: KeyEventLike, key: string): boolean {
  return matchesCombo(event, [key])
}

export function detectMac(platform: string | undefined): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform ?? "")
}

const MAC_LABELS: Record<string, string> = {
  mod: "⌘",
  shift: "⇧",
  alt: "⌥",
  enter: "↵",
  tab: "⇥",
  esc: "esc",
}
const OTHER_LABELS: Record<string, string> = {
  mod: "Ctrl",
  shift: "Shift",
  alt: "Alt",
  enter: "↵",
  tab: "Tab",
  esc: "Esc",
}

function keyLabel(key: string, mac: boolean) {
  const named = (mac ? MAC_LABELS : OTHER_LABELS)[key]
  if (named) return named
  return key.length === 1 ? key.toUpperCase() : key
}

// The text for each key cap. A combo is one cap ("⌘K", "Ctrl+K"); a sequence is one per key.
export function formatShortcut(item: Shortcut, mac: boolean): string[] {
  const labels = item.keys.map((key) => keyLabel(key, mac))
  return item.sequence ? labels : [labels.join(mac ? "" : "+")]
}

// The same as plain text, for tooltips ("⌘B", "G then D").
export function shortcutLabel(item: Shortcut, mac: boolean): string {
  return formatShortcut(item, mac).join(item.sequence ? " then " : "")
}
