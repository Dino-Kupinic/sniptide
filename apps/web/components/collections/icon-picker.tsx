"use client"

import { Popover, PopoverContent, PopoverTrigger } from "@sniptide/ui/components/popover"
import { cn } from "@sniptide/ui/lib/utils"
import * as React from "react"
import { renameCollection, setCollectionIcon } from "@/lib/collections/actions"
import { type Collection, HUES, ICONS, MAX_NAME_LENGTH } from "@/lib/collections/types"
import { CollectionIcon, hueClass, hueLabel } from "./icon"

// A collection's icon, as a button that opens the picker: its name, twelve square icons and ten
// hues. Every pick saves at once; the name saves on Enter or when the field loses focus.
export function CollectionIconPicker({
  collection,
  className,
}: {
  collection: Collection
  className?: string
}) {
  const [icon, setIcon] = React.useState(collection.icon)
  const [hue, setHue] = React.useState(collection.hue)
  const [error, setError] = React.useState<string | null>(null)
  const [, startTransition] = React.useTransition()

  // Follow the server once it catches up (or another tab changes it).
  React.useEffect(() => setIcon(collection.icon), [collection.icon])
  React.useEffect(() => setHue(collection.hue), [collection.hue])

  function pick(next: { icon?: Collection["icon"]; hue?: Collection["hue"] }) {
    const nextIcon = next.icon ?? icon
    const nextHue = next.hue ?? hue
    setIcon(nextIcon)
    setHue(nextHue)
    startTransition(() => setCollectionIcon(collection.slug, nextIcon, nextHue))
  }

  function rename(input: HTMLInputElement) {
    const name = input.value.trim()
    if (!name || name === collection.name) {
      input.value = collection.name
      return setError(null)
    }
    startTransition(async () => {
      const result = await renameCollection(collection.slug, name)
      setError(result.ok ? null : result.error)
    })
  }

  return (
    <Popover onOpenChange={() => setError(null)}>
      <PopoverTrigger
        aria-label={`Change icon for ${collection.name}`}
        className={cn(
          "relative z-10 flex size-5 shrink-0 items-center justify-center outline-none hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-foreground/10",
          className,
        )}
      >
        <CollectionIcon icon={icon} hue={hue} className="size-3" />
      </PopoverTrigger>
      <PopoverContent side="right" className="w-72" sideOffset={10}>
        <div className="flex items-center gap-2 border-b border-border p-3">
          <span className="flex size-9 shrink-0 items-center justify-center border border-border">
            <CollectionIcon icon={icon} hue={hue} className="size-4" />
          </span>
          <input
            key={collection.name}
            aria-label="Collection name"
            defaultValue={collection.name}
            maxLength={MAX_NAME_LENGTH}
            autoComplete="off"
            onBlur={(event) => rename(event.currentTarget)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                rename(event.currentTarget)
              }
            }}
            aria-invalid={Boolean(error)}
            className="h-9 min-w-0 flex-1 border border-border bg-transparent px-2.5 font-mono text-[13px] outline-none focus:border-primary aria-invalid:border-destructive"
          />
        </div>
        {error ? (
          <p role="alert" className="px-3 pt-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}

        <IconOptions icon={icon} hue={hue} onPick={pick} />
      </PopoverContent>
    </Popover>
  )
}

// The twelve icons and ten hues, for the picker above and for the New collection dialog.
export function IconOptions({
  icon,
  hue,
  onPick,
}: {
  icon: Collection["icon"]
  hue: Collection["hue"]
  onPick: (next: { icon?: Collection["icon"]; hue?: Collection["hue"] }) => void
}) {
  const id = React.useId()

  return (
    <>
      <div className="flex flex-col gap-2 px-3 pt-3 pb-1">
        <p id={`${id}-icon`} className="text-xs font-medium text-muted-foreground">
          Icon
        </p>
        <fieldset
          aria-labelledby={`${id}-icon`}
          className="m-0 grid min-w-0 grid-cols-6 gap-1 border-0 p-0"
        >
          {ICONS.map((option) => (
            <button
              key={option}
              type="button"
              aria-label={option}
              aria-pressed={option === icon}
              onClick={() => onPick({ icon: option })}
              className={cn(
                "flex size-10 items-center justify-center border border-transparent outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 aria-pressed:border-current aria-pressed:bg-current/5",
                hueClass[hue],
              )}
            >
              <CollectionIcon icon={option} hue={hue} className="size-4" />
            </button>
          ))}
        </fieldset>
      </div>

      <div className="flex flex-col gap-2 p-3">
        <p id={`${id}-hue`} className="text-xs font-medium text-muted-foreground">
          Color
        </p>
        <fieldset
          aria-labelledby={`${id}-hue`}
          className="m-0 flex min-w-0 justify-between border-0 p-0"
        >
          {HUES.map((option) => (
            <button
              key={option}
              type="button"
              aria-label={hueLabel[option]}
              aria-pressed={option === hue}
              onClick={() => onPick({ hue: option })}
              className={cn(
                "flex size-6 items-center justify-center border-2 border-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring/40 aria-pressed:border-current",
                hueClass[option],
              )}
            >
              <span className={cn("bg-current", option === hue ? "size-4" : "size-[18px]")} />
            </button>
          ))}
        </fieldset>
      </div>
    </>
  )
}
