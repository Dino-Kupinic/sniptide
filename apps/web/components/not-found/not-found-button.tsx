import { Button } from "@sniptide/ui/components/button"
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
      size="xl"
      // biome-ignore lint/a11y/useAnchorContent: Button renders the children into this anchor.
      render={external ? <a href={href} /> : <Link href={href} />}
      nativeButton={false}
    >
      {children}
    </Button>
  )
}
