import type { Metadata } from "next"
import { currentViewer } from "@/components/not-found/current-viewer"
import { NotFoundContent } from "@/components/not-found/not-found-content"

export const metadata: Metadata = { title: "Not found" }

// notFound() inside the app renders within the app shell, which already has the logo and the
// account, so this is the root 404 without its header.
export default async function AppNotFound() {
  return (
    <div className="flex h-full flex-col">
      <NotFoundContent viewer={await currentViewer()} />
    </div>
  )
}
