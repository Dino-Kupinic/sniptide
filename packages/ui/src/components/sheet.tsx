"use client"

import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"
import { cn } from "cn"
import { XIcon } from "lucide-react"
import type * as React from "react"

const Sheet = SheetPrimitive.Root
const SheetTrigger = SheetPrimitive.Trigger
const SheetClose = SheetPrimitive.Close
const SheetTitle = SheetPrimitive.Title
const SheetDescription = SheetPrimitive.Description

function SheetContent({
  className,
  side = "left",
  ...props
}: SheetPrimitive.Popup.Props & { side?: "left" | "right" | "bottom" }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Backdrop className="fixed inset-0 z-40 bg-foreground/30 transition-opacity dark:bg-black/60 data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        // The side width stays unprefixed so a caller's width class can replace it.
        className={cn(
          "fixed z-50 flex w-72 max-w-[85vw] flex-col bg-background outline-none transition-transform duration-200 data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:border-l data-[side=bottom]:inset-x-0 data-[side=bottom]:w-auto data-[side=bottom]:max-w-none data-[side=bottom]:bottom-0 data-[side=bottom]:max-h-[85dvh] data-[side=bottom]:rounded-t-lg data-[side=bottom]:border-t data-[side=bottom]:pb-[env(safe-area-inset-bottom)] data-[side=left]:data-starting-style:-translate-x-full data-[side=left]:data-ending-style:-translate-x-full data-[side=right]:data-starting-style:translate-x-full data-[side=right]:data-ending-style:translate-x-full data-[side=bottom]:data-starting-style:translate-y-full data-[side=bottom]:data-ending-style:translate-y-full",
          className,
        )}
        {...props}
      />
    </SheetPrimitive.Portal>
  )
}

// A bottom sheet's title row: the title in the title-sm role and a close button at the end.
function SheetHeader({
  title,
  closeLabel,
  className,
  children,
}: {
  title: React.ReactNode
  closeLabel: string
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div className={cn("flex shrink-0 items-center gap-2 px-4 pt-4 pb-2", className)}>
      <SheetPrimitive.Title className="min-w-0 flex-1 truncate font-heading text-xl leading-7 font-bold tracking-[-0.02em]">
        {title}
      </SheetPrimitive.Title>
      {children}
      <SheetPrimitive.Close
        aria-label={closeLabel}
        className="-mr-1 inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <XIcon className="size-4" />
      </SheetPrimitive.Close>
    </div>
  )
}

// The scrolling part of a sheet, padded to the 16px mobile gutter.
function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4", className)}
      {...props}
    />
  )
}

// A 48px row in a sheet list: a 16px icon, a 14px label and an optional trailing value.
const sheetRowClass =
  "flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium outline-none hover:bg-muted focus-visible:bg-muted active:bg-muted aria-[current=page]:bg-muted [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"

export {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  sheetRowClass,
}
