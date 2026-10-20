import { getTranslations } from "next-intl/server"
import { currentViewer } from "@/components/not-found/current-viewer"
import { NotFoundContent } from "@/components/not-found/not-found-content"

export async function generateMetadata() {
  const t = await getTranslations("NotFound")
  return { title: t("title") }
}

// notFound() inside the app renders within the app shell, which already has the logo and the
// account, so this is the root 404 without its header.
export default async function AppNotFound() {
  return (
    <div className="flex h-full flex-col">
      <NotFoundContent viewer={await currentViewer()} />
    </div>
  )
}
