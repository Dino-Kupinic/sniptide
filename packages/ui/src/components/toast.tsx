"use client"

import { Toast as ToastPrimitive } from "@base-ui/react/toast"
import { cn } from "cn"
import { XIcon } from "lucide-react"

// Square toasts with the hard offset shadow the menus use. `toast` is a global manager, so server
// action callbacks and plain functions can raise one; mount <Toaster /> once near the root.
const toast = ToastPrimitive.createToastManager()

// How long an action toast (one with an Undo) stays up. Hovering or focusing it pauses the clock.
const TOAST_ACTION_TIMEOUT = 8000

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager()
  return toasts.map((item) => (
    <ToastPrimitive.Root
      key={item.id}
      toast={item}
      className={cn(
        "pointer-events-auto flex w-full items-center gap-3 border border-offset-shadow bg-popover py-2.5 pr-2 pl-4 text-popover-foreground shadow-[4px_4px_0_0_var(--offset-shadow)] transition-[opacity,translate] duration-150 data-ending-style:translate-y-2 data-ending-style:opacity-0 data-starting-style:translate-y-2 data-starting-style:opacity-0",
        item.type === "error" && "border-destructive shadow-[4px_4px_0_0_var(--destructive)]",
      )}
    >
      <ToastPrimitive.Content className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <ToastPrimitive.Title className="truncate text-sm font-medium" />
          <ToastPrimitive.Description className="truncate text-[13px] text-muted-foreground" />
        </div>
        {item.actionProps ? (
          <ToastPrimitive.Action className="shrink-0 px-2 py-1 text-sm font-semibold text-link outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40" />
        ) : null}
        <ToastPrimitive.Close
          aria-label="Dismiss"
          className="flex size-7 shrink-0 items-center justify-center text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <XIcon className="size-4" />
        </ToastPrimitive.Close>
      </ToastPrimitive.Content>
    </ToastPrimitive.Root>
  ))
}

// Mounts the provider and viewport. On phones the viewport clears the bottom tab bar.
function Toaster({ className }: { className?: string }) {
  return (
    <ToastPrimitive.Provider toastManager={toast} limit={3}>
      <ToastPrimitive.Portal>
        <ToastPrimitive.Viewport
          className={cn(
            "pointer-events-none fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-[60] mx-auto flex max-w-sm flex-col gap-2 lg:inset-x-auto lg:right-6 lg:bottom-6 lg:mx-0 lg:w-96",
            className,
          )}
        >
          <ToastList />
        </ToastPrimitive.Viewport>
      </ToastPrimitive.Portal>
    </ToastPrimitive.Provider>
  )
}

export { TOAST_ACTION_TIMEOUT, Toaster, toast }
