import type { Metadata } from "next"
import { currentViewer } from "@/components/not-found/current-viewer"
import { ShareNotFound } from "@/components/not-found/share-not-found"
import { PublicHeader } from "@/components/public-header"

export const metadata: Metadata = { title: "This page is gone · Sniptide" }

// Shown at sniptide.com/<slug> when no paste matches, or it expired or was burned. This is the
// marketing 404 from Paper: sniptide.com proxies every link it has no page for to this app, so
// the marketing site can't render it itself.
export default async function ShareLinkNotFound() {
  const viewer = await currentViewer()

  return (
    <div className="flex min-h-dvh flex-col bg-background dark:bg-sidebar">
      <PublicHeader signedIn={viewer !== null} className="h-14 border-b border-border lg:h-16" />
      <ShareNotFound />
    </div>
  )
}
