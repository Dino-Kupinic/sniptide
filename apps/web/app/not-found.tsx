import { Avatar, AvatarFallback, AvatarImage } from "@sniptide/ui/components/avatar"
import { Logo } from "@sniptide/ui/components/logo"
import { cn } from "@sniptide/ui/lib/utils"
import type { Metadata } from "next"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { currentViewer } from "@/components/not-found/current-viewer"
import { NotFoundContent } from "@/components/not-found/not-found-content"
import { TabBar } from "@/components/shell/tab-bar"
import { listCollections } from "@/lib/collections/store"
import { trashTotals } from "@/lib/pastes/lists"
import { navCounts } from "@/lib/pastes/store"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("NotFound")
  return { title: t("title") }
}

// The counts the tab bar's More sheet shows; a 404 still renders when they can't be read.
async function moreCounts() {
  try {
    const [counts, trash, collections] = await Promise.all([
      navCounts(),
      trashTotals(),
      listCollections(),
    ])
    return { shared: counts.shared, trash: trash.count, collections: collections.length }
  } catch {
    return { shared: 0, trash: 0, collections: 0 }
  }
}

// The app's 404, from the Paper "Not found" artboards. Lives at the root so it also answers URLs
// no route matches, which is why it draws its own header instead of the app shell. Signed-in
// phones also get the app's tab bar, so the way back is the usual one.
export default async function NotFound() {
  const [viewer, t, core] = await Promise.all([
    currentViewer(),
    getTranslations("NotFound"),
    getTranslations("Core"),
  ])
  const counts = viewer ? await moreCounts() : null

  return (
    <div
      className={cn(
        "flex min-h-dvh flex-col bg-background dark:bg-sidebar",
        viewer && "max-lg:pb-[calc(3.5rem+env(safe-area-inset-bottom))]",
      )}
    >
      <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-border px-4 sm:px-8">
        <Link
          href={viewer ? "/dashboard" : "/"}
          aria-label="Sniptide"
          className="flex w-fit items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <Logo className="max-sm:[&>svg]:size-6 max-sm:[&>span]:hidden" />
        </Link>
        <span className="text-sm font-medium max-sm:hidden">{t("title")}</span>
        <div className="flex justify-end max-sm:col-start-3">
          {viewer ? (
            <Link
              href="/settings"
              aria-label={core("settings")}
              className="flex size-10 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <Avatar className="size-7 font-heading text-[11px] font-bold dark:bg-border dark:text-white">
                {viewer.image ? <AvatarImage src={viewer.image} alt="" /> : null}
                <AvatarFallback>{viewer.initials}</AvatarFallback>
              </Avatar>
            </Link>
          ) : null}
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <NotFoundContent viewer={viewer} />
      </main>

      {viewer && counts ? <TabBar viewer={viewer} counts={counts} /> : null}
    </div>
  )
}
