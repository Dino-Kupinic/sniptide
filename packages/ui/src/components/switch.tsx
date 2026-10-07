import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "cn"

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "inline-flex h-5 w-9 shrink-0 items-center border border-input bg-background p-0.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 data-checked:border-primary data-checked:bg-primary",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="size-3.5 bg-input transition-[translate,background-color] duration-150 data-checked:translate-x-4 data-checked:bg-primary-foreground" />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
