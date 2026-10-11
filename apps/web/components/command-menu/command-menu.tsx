"use client"

import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import * as React from "react"
import { NewCollectionDialog } from "@/components/collections/new-collection"
import { ImportGistSheet } from "@/components/lists/import-gist"
import { isTypingTarget } from "@/components/theme-provider"
import type { Collection } from "@/lib/collections/types"
import type { SidebarPaste } from "@/lib/pastes/types"
import { CommandMenuDialog } from "./command-menu-dialog"
import { createCommands, GO_TO } from "./commands"

const CommandMenuContext = React.createContext<{ open: () => void }>({ open: () => {} })

// Opens the ⌘K menu from the sidebar's Search button, the header field and the mobile top bar.
export function useCommandMenu() {
  return React.useContext(CommandMenuContext)
}

// How long G waits for the key that completes a "go to" chord.
const CHORD_MS = 1200

// Owns the menu for the whole app shell: the ⌘K / Ctrl K shortcut, the G-then-key chords on the
// Go to rows, and the dialogs its actions open (New collection, Import gist).
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
      }),
    [resolvedTheme, setTheme],
  )
  const menu = React.useMemo(() => ({ open: () => setOpen(true) }), [])

  React.useEffect(() => {
    let armedAt = 0

    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen((current) => !current)
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.repeat) return
      if (event.defaultPrevented || isTypingTarget(event.target)) return

      const key = event.key.toLowerCase()
      const armed = armedAt > 0 && Date.now() - armedAt < CHORD_MS
      armedAt = 0
      const target = armed ? GO_TO.find((item) => item.chord === key) : undefined
      if (target) {
        // The theme's own D shortcut checks defaultPrevented, so G then D doesn't flip it too.
        event.preventDefault()
        router.push(target.href)
      } else if (key === "g") {
        armedAt = Date.now()
      }
    }

    // Capture phase: the chord has to claim its second key before the theme's D shortcut sees it.
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [router])

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
