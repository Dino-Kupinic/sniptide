"use client"

import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"
import { cn } from "cn"
import { CheckIcon, SearchIcon } from "lucide-react"
import type * as React from "react"

// A searchable menu: a trigger opens a popup with a search field above a filtered list. Built on
// Base UI's Combobox with the input inside the popup, and styled like DropdownMenu.

const Combobox = ComboboxPrimitive.Root
const ComboboxTrigger = ComboboxPrimitive.Trigger
const ComboboxCollection = ComboboxPrimitive.Collection

function ComboboxContent({
  className,
  align = "start",
  sideOffset = 6,
  side,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<ComboboxPrimitive.Positioner.Props, "align" | "sideOffset" | "side">) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        className="z-50"
        align={align}
        side={side}
        sideOffset={sideOffset}
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn(
            "flex w-60 max-w-(--available-width) flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-(--float-shadow) outline-none origin-(--transform-origin) transition-[scale,opacity] duration-100 data-starting-style:scale-[0.98] data-starting-style:opacity-0 data-ending-style:scale-[0.98] data-ending-style:opacity-0",
            className,
          )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  )
}

// The search field, set on a hairline above the list.
function ComboboxSearch({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
      <SearchIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <ComboboxPrimitive.Input
        data-slot="combobox-search"
        className={cn(
          "h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground any-pointer-coarse:text-base",
          className,
        )}
        {...props}
      />
    </div>
  )
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      className={cn("px-3 py-4 text-sm text-muted-foreground empty:hidden", className)}
      {...props}
    />
  )
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        "scrollbar-subtle max-h-[min(20rem,calc(var(--available-height)-2.5rem))] overflow-y-auto overscroll-contain p-1 scroll-py-1 outline-none data-empty:hidden",
        className,
      )}
      {...props}
    />
  )
}

// A group of items. Groups after the first sit below a hairline, which only shows while both
// groups have matches.
function ComboboxGroup({ className, ...props }: ComboboxPrimitive.Group.Props) {
  return (
    <ComboboxPrimitive.Group
      data-slot="combobox-group"
      className={cn("block [&+&]:mt-1 [&+&]:border-t [&+&]:border-border [&+&]:pt-1", className)}
      {...props}
    />
  )
}

function ComboboxItem({
  className,
  children,
  ...props
}: ComboboxPrimitive.Item.Props & { children?: React.ReactNode }) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "flex h-8 cursor-default items-center gap-2 rounded-md px-3 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-muted",
        className,
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator className="ml-auto">
        <CheckIcon className="size-4 text-muted-foreground" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  )
}

export {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxSearch,
  ComboboxTrigger,
}
