"use client"

import { Button } from "@sniptide/ui/components/button"
import { Checkbox } from "@sniptide/ui/components/checkbox"
import { TableCell, TableHead } from "@sniptide/ui/components/table"
import { XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import * as React from "react"

export interface RowSelection {
  // The selected keys, in the order the rows are shown.
  keys: string[]
  count: number
  all: boolean
  has: (key: string) => boolean
  // `range` extends the selection from the last row clicked, as Shift-click does.
  toggle: (key: string, checked: boolean, range?: boolean) => void
  toggleAll: (checked: boolean) => void
  clear: () => void
}

// Which rows of a list are checked. `keys` are the rows on screen, in order. A key that leaves
// the list (another page, a filter, a deleted row) leaves the selection with it.
export function useRowSelection(keys: string[]): RowSelection {
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(() => new Set())
  const anchor = React.useRef<string | null>(null)
  const visible = keys.filter((key) => selected.has(key))
  const clear = React.useCallback(() => {
    setSelected(new Set())
    anchor.current = null
  }, [])

  // Drop keys that left the list while rendering, as React suggests for state derived from props.
  const signature = keys.join("\u0000")
  const [shown, setShown] = React.useState(signature)
  if (shown !== signature) {
    setShown(signature)
    const next = new Set(keys.filter((key) => selected.has(key)))
    if (next.size !== selected.size) setSelected(next)
  }

  return {
    keys: visible,
    count: visible.length,
    all: keys.length > 0 && visible.length === keys.length,
    has: (key) => selected.has(key),
    toggle(key, checked, range = false) {
      const from = range && anchor.current ? keys.indexOf(anchor.current) : -1
      const to = keys.indexOf(key)
      const span =
        from === -1 || to === -1 ? [key] : keys.slice(Math.min(from, to), Math.max(from, to) + 1)
      setSelected((current) => {
        const next = new Set(current)
        for (const item of span) {
          if (checked) next.add(item)
          else next.delete(item)
        }
        return next
      })
      anchor.current = key
    },
    toggleAll(checked) {
      setSelected(checked ? new Set(keys) : new Set())
      anchor.current = null
    },
    clear,
  }
}

// Whether Shift was held for the click or key press that toggles a checkbox. Base UI reports the
// change from its hidden input, so the modifier is read from the event on the box itself. A
// Shift-click would also select the text between the rows, so its mousedown is cancelled.
function useShiftRef() {
  const shift = React.useRef(false)
  const record = (event: React.PointerEvent | React.KeyboardEvent) => {
    shift.current = event.shiftKey
  }
  return {
    shift,
    onPointerDown: record,
    onKeyDown: record,
    onMouseDown: (event: React.MouseEvent) => {
      if (event.shiftKey) event.preventDefault()
    },
  }
}

// The checkbox column's header: selects every row on the page, and shows a dash while only some
// are checked.
export function SelectAllHead({ selection }: { selection: RowSelection }) {
  const t = useTranslations("Workspace")
  return (
    <TableHead className="w-12 pr-0">
      <Checkbox
        aria-label={t("select_all_on_page")}
        checked={selection.all}
        indeterminate={selection.count > 0 && !selection.all}
        onCheckedChange={(checked) => selection.toggleAll(checked)}
        className="relative z-10"
      />
    </TableHead>
  )
}

// A row's checkbox. It sits above the row's stretched link, so checking it doesn't open the paste.
export function SelectCell({
  selection,
  rowKey,
  name,
}: {
  selection: RowSelection
  rowKey: string
  name: string
}) {
  const t = useTranslations("Workspace")
  const { shift, ...handlers } = useShiftRef()
  return (
    <TableCell className="w-12 pr-0">
      <Checkbox
        aria-label={t("select_named", { name })}
        checked={selection.has(rowKey)}
        onCheckedChange={(checked) => selection.toggle(rowKey, checked, shift.current)}
        className="relative z-10"
        {...handlers}
      />
    </TableCell>
  )
}

// The bar of bulk actions that floats at the bottom of a list while rows are checked. It sticks
// to the bottom of the window as the list scrolls, and Escape clears the selection. It starts at
// the list's left edge, so the Undo toast in the bottom-right corner never covers it.
export function SelectionBar({
  selection,
  children,
}: {
  selection: RowSelection
  children: React.ReactNode
}) {
  const t = useTranslations("Workspace")
  const { count, clear } = selection

  React.useEffect(() => {
    if (count === 0) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return
      // A menu or dialog opened from the bar closes first.
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest("[role=dialog],[role=alertdialog],[role=menu],input,textarea")) return
      clear()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [count, clear])

  if (count === 0) return null
  return (
    <div className="pointer-events-none sticky bottom-6 z-20 hidden lg:flex">
      <div
        role="toolbar"
        aria-label={t("selection_actions")}
        className="pointer-events-auto flex items-center gap-1 rounded-lg border border-border bg-popover p-1.5 pl-4 text-popover-foreground shadow-(--float-shadow) animate-in fade-in slide-in-from-bottom-2 duration-150 motion-reduce:animate-none"
      >
        <span aria-live="polite" className="pr-2 text-[13px] font-medium tabular-nums">
          {t("selected_count", { count })}
        </span>
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
        {children}
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
        <Button variant="ghost" size="icon-sm" aria-label={t("clear_selection")} onClick={clear}>
          <XIcon />
        </Button>
      </div>
    </div>
  )
}
