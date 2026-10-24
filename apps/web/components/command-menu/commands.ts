import {
  ChartColumnIcon,
  ContrastIcon,
  DownloadIcon,
  FolderIcon,
  FolderPlusIcon,
  KeyboardIcon,
  KeyRoundIcon,
  LayoutGridIcon,
  type LucideIcon,
  PlusIcon,
  StarIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react"
import type { ShortcutId } from "@/lib/shortcuts"

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

// The "Go to" rows. `shortcut` names the G-then-key sequence, for the pages that have one.
const GO_TO: {
  id: string
  label: string
  icon: LucideIcon
  href: string
  shortcut?: ShortcutId
}[] = [
  {
    id: "go-dashboard",
    label: "dashboard",
    icon: LayoutGridIcon,
    href: "/dashboard",
    shortcut: "go-dashboard",
  },
  { id: "go-analytics", label: "analytics", icon: ChartColumnIcon, href: "/analytics" },
  { id: "go-starred", label: "starred", icon: StarIcon, href: "/starred", shortcut: "go-starred" },
  {
    id: "go-collections",
    label: "collections",
    icon: FolderIcon,
    href: "/collections",
    shortcut: "go-collections",
  },
  { id: "go-secrets", label: "secrets", icon: KeyRoundIcon, href: "/secrets" },
  { id: "go-shared", label: "shared_with_me", icon: UsersIcon, href: "/shared" },
  { id: "go-trash", label: "trash", icon: Trash2Icon, href: "/trash", shortcut: "go-trash" },
]

export function createCommands(actions: {
  newCollection: () => void
  importGist: () => void
  toggleTheme: () => void
  showShortcuts: () => void
}): Command[] {
  return [
    ...GO_TO.map((row): Command => ({ ...row, group: "go" })),
    {
      id: "new-paste",
      group: "actions",
      label: "new_paste",
      icon: PlusIcon,
      shortcut: "new-paste",
      href: "/new",
    },
    {
      id: "new-collection",
      group: "actions",
      label: "new_collection",
      icon: FolderPlusIcon,
      run: actions.newCollection,
    },
    {
      id: "import-gist",
      group: "actions",
      label: "import_gist",
      icon: DownloadIcon,
      run: actions.importGist,
    },
    {
      id: "toggle-theme",
      group: "actions",
      label: "toggle_theme",
      icon: ContrastIcon,
      shortcut: "toggle-theme",
      run: actions.toggleTheme,
    },
    {
      id: "show-shortcuts",
      group: "actions",
      label: "keyboard_shortcuts",
      icon: KeyboardIcon,
      shortcut: "help",
      run: actions.showShortcuts,
    },
  ]
}
