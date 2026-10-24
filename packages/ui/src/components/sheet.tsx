"use client"

import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"
import { cn } from "cn"

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

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger }
