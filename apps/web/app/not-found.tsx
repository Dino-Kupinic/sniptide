import { Avatar, AvatarFallback, AvatarImage } from "@sniptide/ui/components/avatar"
import { LogoMark } from "@sniptide/ui/components/logo"
import type { Metadata } from "next"
import Link from "next/link"
import { currentViewer } from "@/components/not-found/current-viewer"
import { NotFoundContent } from "@/components/not-found/not-found-content"

export const metadata: Metadata = { title: "Not found" }

// The app's 404, from the Paper "Not found" artboards. Lives at the root so it also answers URLs
// no route matches, which is why it draws its own header instead of the app shell.
export default async function NotFound() {
  const viewer = await currentViewer()

  return (
    <div className="flex min-h-dvh flex-col bg-background dark:bg-sidebar">
      <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-border px-5 sm:px-8">
        <Link
          href={viewer ? "/dashboard" : "/"}
          aria-label="Sniptide"
          className="flex w-fit items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <LogoMark className="size-6 sm:size-7" />
          <span className="hidden font-logo text-[25px] leading-7 font-bold tracking-[-0.01em] sm:inline">
            SNIPTIDE
          </span>
        </Link>
        <span className="text-sm font-medium">Not found</span>
        <div className="flex justify-end">
          {viewer ? (
            <Avatar className="size-7 font-heading text-[11px] font-bold dark:bg-border dark:text-white">
              {viewer.image ? <AvatarImage src={viewer.image} alt="" /> : null}
              <AvatarFallback>{viewer.initials}</AvatarFallback>
            </Avatar>
          ) : null}
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <NotFoundContent viewer={viewer} />
      </main>
    </div>
  )
}
