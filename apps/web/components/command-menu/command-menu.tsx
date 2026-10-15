"use client"

import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import * as React from "react"
import { NewCollectionDialog } from "@/components/collections/new-collection"
import { ImportGistSheet } from "@/components/lists/import-gist"
import { useShortcutsHelp } from "@/components/shortcuts/shortcuts-help"
import type { Collection } from "@/lib/collections/types"
import { shouldIgnoreSingleKey } from "@/lib/keyboard"
import type { SidebarPaste } from "@/lib/pastes/types"
import { isPlainKey, matchesCombo, SHORTCUTS, type Shortcut, shortcut } from "@/lib/shortcuts"
import { CommandMenuDialog } from "./command-menu-dialog"
import { createCommands } from "./commands"

const CommandMenuContext = React.createContext<{ open: () => void }>({ open: () => {} })

// Opens the ⌘K menu from the sidebar's Search button, the header field and the mobile top bar.
export function useCommandMenu() {
  return React.useContext(CommandMenuContext)
}

// How long the first key of a sequence (G, T) waits for the key that completes it.
const CHORD_MS = 1200

// The letter-then-letter shortcuts in the registry: G then D, T then T and so on.
const SEQUENCES = (SHORTCUTS as readonly Shortcut[]).filter(
  (item) => "sequence" in item && item.keys.length === 2 && /^[a-z]$/.test(item.keys[0] ?? ""),
)
const LEADERS = new Set<string | undefined>(SEQUENCES.map((item) => item.keys[0]))

// Owns the menu for the whole app shell: the ⌘K / Ctrl K and / shortcuts, the G-then-key chords on
// the Go to rows, and the dialogs its actions open (New collection, Import gist).
export function CommandMenuProvider({
  recent,
  collections,
  children,
}: {
  recent: SidebarPaste[]
  collections: Collection[]
  children: React.ReactNode
}) {
  const router = useRouter()
  const shortcuts = useShortcutsHelp()
  const { resolvedTheme, setTheme } = useTheme()
  const [open, setOpen] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [importing, setImporting] = React.useState(false)

  const commands = React.useMemo(
    () =>
      createCommands({
        newCollection: () => setCreating(true),
        importGist: () => setImporting(true),
        toggleTheme: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
        showShortcuts: shortcuts.open,
      }),
    [resolvedTheme, setTheme, shortcuts.open],
  )
  const menu = React.useMemo(() => ({ open: () => setOpen(true) }), [])

  React.useEffect(() => {
    let armed: { leader: string; at: number } | null = null

    function onKeyDown(event: KeyboardEvent) {
      if (matchesCombo(event, shortcut("command-menu").keys)) {
        event.preventDefault()
        setOpen((current) => !current)
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey || shouldIgnoreSingleKey(event)) return

      // / is the search shortcut. It needs no Shift on a US keyboard but is Shift+7 on a German one,
      // so only the key itself is checked.
      if (isPlainKey(event, "/")) {
        event.preventDefault()
        setOpen(true)
        return
      }
      if (event.shiftKey) return

      const key = event.key.toLowerCase()
      const leader = armed && Date.now() - armed.at < CHORD_MS ? armed.leader : null
      armed = null
      const hit = leader
        ? SEQUENCES.find((item) => item.keys[0] === leader && item.keys[1] === key)
        : undefined
      const command = hit ? commands.find((item) => item.id === hit.id) : undefined
      if (command) {
        event.preventDefault()
        if (command.href) router.push(command.href)
        else command.run?.()
      } else if (LEADERS.has(key)) {
        armed = { leader: key, at: Date.now() }
      }
    }

    // Capture phase, so the second key of a sequence is claimed before anything else sees it.
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [router, commands])

  return (
    <CommandMenuContext value={menu}>
      {children}
      <CommandMenuDialog
        open={open}
        onOpenChange={setOpen}
        recent={recent}
        collections={collections}
        commands={commands}
      />
      <NewCollectionDialog
        open={creating}
        onOpenChange={setCreating}
        existing={collections.length}
      />
      <ImportGistSheet open={importing} onOpenChange={setImporting} />
    </CommandMenuContext>
  )
}
