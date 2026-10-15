"use client"

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@sniptide/ui/components/dialog"
import { Kbd } from "@sniptide/ui/components/kbd"
import { XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { shouldIgnoreSingleKey } from "@/lib/keyboard"
import { isPlainKey, SHORTCUT_GROUPS, SHORTCUTS } from "@/lib/shortcuts"
import { ShortcutKeys } from "./shortcut-keys"

const ShortcutsContext = React.createContext<{ open: () => void }>({ open: () => {} })

// Opens the shortcut sheet from the ⌘K menu and the account menu.
export function useShortcutsHelp() {
  return React.useContext(ShortcutsContext)
}

// Owns the shortcut sheet and the app-wide single-key shortcuts that aren't tied to the command
// menu: ? opens the sheet (and closes it again) and N starts a new paste. Like every single-key
// shortcut they stay quiet while you type or while a dialog is open.
export function ShortcutsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const help = React.useMemo(() => ({ open: () => setOpen(true) }), [])

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isPlainKey(event, "?")) {
        // The sheet is itself the open dialog, so it has to let ? through to close.
        if (open && !event.repeat) {
          event.preventDefault()
          setOpen(false)
        } else if (!shouldIgnoreSingleKey(event)) {
          event.preventDefault()
          setOpen(true)
        }
      } else if (isPlainKey(event, "n") && !shouldIgnoreSingleKey(event)) {
        event.preventDefault()
        router.push("/new")
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, router])

  return (
    <ShortcutsContext value={help}>
      {children}
      <ShortcutsSheet open={open} onOpenChange={setOpen} />
    </ShortcutsContext>
  )
}

function ShortcutsSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-4rem)] max-w-none gap-0 overflow-hidden p-0 lg:w-170">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="flex flex-col gap-1">
            <DialogTitle className="text-base">Keyboard shortcuts</DialogTitle>
            <DialogDescription>
              Single keys work when you aren't typing in a field.
            </DialogDescription>
          </div>
          <DialogClose
            aria-label="Close"
            className="-mr-1.5 flex size-8 shrink-0 items-center justify-center text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <XIcon className="size-4" />
          </DialogClose>
        </div>

        <div className="grid gap-x-10 gap-y-6 overflow-y-auto px-5 py-5 sm:grid-cols-2">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.id} aria-labelledby={`shortcuts-${group.id}`}>
              <h3 id={`shortcuts-${group.id}`} className="mb-2 text-xs text-muted-foreground">
                {group.title}
              </h3>
              <ul className="flex flex-col">
                {SHORTCUTS.filter((item) => item.group === group.id).map((item) => (
                  <li
                    key={item.id}
                    className="flex min-h-9 items-center justify-between gap-4 border-b border-border text-sm last:border-b-0"
                  >
                    {item.label}
                    <span className="flex shrink-0 items-center gap-1">
                      <ShortcutKeys id={item.id} className="border border-border" />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="flex h-10 shrink-0 items-center gap-1.5 border-t border-border bg-sidebar px-5 text-xs text-muted-foreground">
          Press <Kbd className="border border-border">?</Kbd> anywhere to open this sheet
        </div>
      </DialogContent>
    </Dialog>
  )
}
