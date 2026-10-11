import {
  ContrastIcon,
  DownloadIcon,
  FolderPlusIcon,
  LayoutGridIcon,
  type LucideIcon,
  PlusIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react"

// A row the menu can run: it either goes to `href` or calls `run`. `shortcut` is only shown, the
// bindings themselves live in command-menu.tsx (G-then-key chords) and the theme provider (D).
export interface Command {
  id: string
  group: "go" | "actions"
  label: string
  icon: LucideIcon
  shortcut?: string[]
  href?: string
  run?: () => void
}

// The "Go to" rows. `chord` is the key that follows G.
export const GO_TO = [
  { id: "go-dashboard", label: "Dashboard", icon: LayoutGridIcon, href: "/dashboard", chord: "d" },
  { id: "go-starred", label: "Starred", icon: StarIcon, href: "/starred", chord: "s" },
  { id: "go-trash", label: "Trash", icon: Trash2Icon, href: "/trash", chord: "t" },
] as const

export function createCommands(actions: {
  newCollection: () => void
  importGist: () => void
  toggleTheme: () => void
}): Command[] {
  return [
    ...GO_TO.map(
      ({ id, label, icon, href, chord }): Command => ({
        id,
        group: "go",
        label,
        icon,
        href,
        shortcut: ["G", chord.toUpperCase()],
      }),
    ),
    {
      id: "new-paste",
      group: "actions",
      label: "New paste",
      icon: PlusIcon,
      shortcut: ["⌘N"],
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
      shortcut: ["D"],
      run: actions.toggleTheme,
    },
  ]
}
