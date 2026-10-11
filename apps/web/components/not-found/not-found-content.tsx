import { Button } from "@sniptide/ui/components/button"
import Link from "next/link"
import type { ViewerSummary } from "@/lib/viewer"
import { Pixel404 } from "./pixel-404"
import { SwitchAccount } from "./switch-account"

// Everything under the header in the Paper "Not found" artboards. Shared by the full-page 404
// (app/not-found.tsx) and the one shown inside the app shell (app/(app)/not-found.tsx).
export function NotFoundContent({ viewer }: { viewer: ViewerSummary | null }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
      <Pixel404 className="w-[302px] sm:w-[536px]" />
      <h1 className="mt-8 text-center font-heading text-[26px] leading-[30px] font-bold tracking-[-0.01em] uppercase sm:mt-10 sm:text-[30px] sm:leading-[34px]">
        Nothing here.
      </h1>
      <p className="mt-2.5 max-w-[440px] text-center text-[15px] leading-[22px] text-muted-foreground">
        We couldn't find that paste or page. It may have been deleted, expired, or the link has a
        typo.
      </p>

      <div className="mt-6 flex w-full max-w-[440px] flex-col gap-2.5 sm:mt-7 sm:w-auto sm:max-w-none sm:flex-row sm:gap-3">
        {viewer ? (
          <>
            <NotFoundButton href="/dashboard">Go to dashboard</NotFoundButton>
            <NotFoundButton href="/trash" outline>
              Open Trash
            </NotFoundButton>
          </>
        ) : (
          <NotFoundButton href="/sign-in">Sign in</NotFoundButton>
        )}
      </div>

      {viewer ? (
        <div className="mt-5 flex flex-col items-center gap-1 sm:mt-[22px] sm:flex-row sm:gap-2">
          <span className="font-mono text-xs leading-4 text-muted-foreground">
            Signed in as {viewer.email}
          </span>
          <SwitchAccount />
        </div>
      ) : null}
    </div>
  )
}

function NotFoundButton({
  href,
  outline,
  children,
}: {
  href: string
  outline?: boolean
  children: React.ReactNode
}) {
  return (
    <Button
      variant={outline ? "outline" : "default"}
      className="h-12 px-[22px] text-[15px] sm:h-11 sm:text-sm"
      render={<Link href={href} />}
      nativeButton={false}
    >
      {children}
    </Button>
  )
}
