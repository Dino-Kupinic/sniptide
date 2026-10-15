import {
  ContrastIcon,
  DownloadIcon,
  FolderIcon,
  FolderPlusIcon,
  KeyboardIcon,
  LayoutGridIcon,
  type LucideIcon,
  PlusIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react"
import { type ShortcutId, shortcut } from "@/lib/shortcuts"

// A row the menu can run: it either goes to `href` or calls `run`. `shortcut` is only shown, the
// bindings themselves live next to what they control: command-menu.tsx (⌘K, /, the two-key sequences),
// and the shortcuts provider (N, ?).
export interface Command {
  id: string
  group: "go" | "actions"
  label: string
  icon: LucideIcon
  shortcut?: ShortcutId
  href?: string
  run?: () => void
}

// The "Go to" rows. `chord` is the key that follows G.
const GO_TO_ROWS = [
  { id: "go-dashboard", label: "Dashboard", icon: LayoutGridIcon, href: "/dashboard" },
  { id: "go-starred", label: "Starred", icon: StarIcon, href: "/starred" },
  { id: "go-collections", label: "Collections", icon: FolderIcon, href: "/collections" },
  { id: "go-trash", label: "Trash", icon: Trash2Icon, href: "/trash" },
] as const

export const GO_TO = GO_TO_ROWS.map((item) => ({ ...item, chord: shortcut(item.id).keys[1] }))

export function createCommands(actions: {
  newCollection: () => void
  importGist: () => void
  toggleTheme: () => void
  showShortcuts: () => void
}): Command[] {
  return [
    ...GO_TO.map(
      ({ id, label, icon, href }): Command => ({
        id,
        group: "go",
        label,
        icon,
        href,
        shortcut: id,
      }),
    ),
    {
      id: "new-paste",
      group: "actions",
      label: "New paste",
      icon: PlusIcon,
      shortcut: "new-paste",
      href: "/new",
    },
    {
      id: "new-collection",
      group: "actions",
      label: "New collection",
      icon: FolderPlusIcon,
      run: actions.newCollection,
    },
    {
      id: "import-gist",
      group: "actions",
      label: "Import gist",
      icon: DownloadIcon,
      run: actions.importGist,
    },
    {
      id: "toggle-theme",
      group: "actions",
      label: "Toggle theme",
      icon: ContrastIcon,
      shortcut: "toggle-theme",
      run: actions.toggleTheme,
    },
    {
      id: "show-shortcuts",
      group: "actions",
      label: "Keyboard shortcuts",
      icon: KeyboardIcon,
      shortcut: "help",
      run: actions.showShortcuts,
    },
  ]
}
