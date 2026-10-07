"use client"

import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"
import { cn } from "cn"

const Sheet = SheetPrimitive.Root
const SheetTrigger = SheetPrimitive.Trigger
const SheetClose = SheetPrimitive.Close
const SheetTitle = SheetPrimitive.Title

function SheetContent({
  className,
  side = "left",
  ...props
}: SheetPrimitive.Popup.Props & { side?: "left" | "right" }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Backdrop className="fixed inset-0 z-40 bg-foreground/30 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed inset-y-0 z-50 flex w-72 max-w-[85vw] flex-col bg-background outline-none transition-transform duration-200 data-[side=left]:left-0 data-[side=left]:border-r data-[side=right]:right-0 data-[side=right]:border-l data-[side=left]:data-starting-style:-translate-x-full data-[side=left]:data-ending-style:-translate-x-full data-[side=right]:data-starting-style:translate-x-full data-[side=right]:data-ending-style:translate-x-full",
          className,
        )}
        {...props}
      />
    </SheetPrimitive.Portal>
  )
}

export { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger }
