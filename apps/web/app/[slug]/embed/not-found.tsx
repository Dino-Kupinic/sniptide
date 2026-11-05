import { getTranslations } from "next-intl/server"
import { Pixel404 } from "@/components/not-found/pixel-404"

// Inside another site's frame, so a plain line in place of the full share 404.
export default async function EmbedNotFound() {
  const t = await getTranslations("Paste")
  return (
    <main className="flex h-svh flex-col gap-4 items-center justify-center rounded-lg border border-border bg-background p-4 text-center text-sm text-muted-foreground">
      <Pixel404 className="w-40 max-w-full" />
      {t("embedUnavailable")}
    </main>
  )
}
