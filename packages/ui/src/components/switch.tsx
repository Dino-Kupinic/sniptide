import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "cn"

// 30×18 square toggle from the Paper designs: grey track with a white thumb when off, primary
// track when on.
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "inline-flex h-[18px] w-[30px] shrink-0 items-center bg-input p-0.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 data-checked:bg-primary",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="size-3.5 bg-background shadow-[0_1px_2px_rgb(0_0_0/0.15)] transition-[translate,background-color] duration-150 data-checked:translate-x-3 data-checked:bg-primary-foreground data-checked:shadow-none" />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
