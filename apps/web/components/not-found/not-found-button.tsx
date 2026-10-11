import { Button } from "@sniptide/ui/components/button"
import { cn } from "@sniptide/ui/lib/utils"
import Link from "next/link"

// Buttons on the 404 pages. `external` renders a plain <a> for the public share 404, which can be
// served from a different domain than the app (see getAppOrigin) where <Link> would prefetch.
export function NotFoundButton({
  href,
  outline,
  external,
  children,
}: {
  href: string
  outline?: boolean
  external?: boolean
  children: React.ReactNode
}) {
  return (
    <Button
      variant={outline ? "outline" : "default"}
      // The artboards' outline border is a step darker than --border in light mode.
      className={cn(
        "h-12 px-[22px] text-[15px] sm:h-11 sm:text-sm",
        outline && "border-[#d9d9d9] dark:border-border",
      )}
      // biome-ignore lint/a11y/useAnchorContent: Button renders the children into this anchor.
      render={external ? <a href={href} /> : <Link href={href} />}
      nativeButton={false}
    >
      {children}
    </Button>
  )
}
