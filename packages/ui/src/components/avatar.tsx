import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar"
import { cn } from "cn"

function Avatar({ className, ...props }: AvatarPrimitive.Root.Props) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center overflow-hidden bg-foreground text-xs font-semibold text-background select-none",
        className,
      )}
      {...props}
    />
  )
}

function AvatarImage({ className, ...props }: AvatarPrimitive.Image.Props) {
  return <AvatarPrimitive.Image className={cn("size-full object-cover", className)} {...props} />
}

function AvatarFallback(props: AvatarPrimitive.Fallback.Props) {
  return <AvatarPrimitive.Fallback {...props} />
}

export { Avatar, AvatarFallback, AvatarImage }
