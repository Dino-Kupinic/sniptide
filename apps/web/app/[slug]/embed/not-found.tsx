import { getTranslations } from "next-intl/server"

// Inside another site's frame, so a plain line in place of the full share 404.
export default async function EmbedNotFound() {
  const t = await getTranslations("Paste")
  return (
    <main className="flex h-svh items-center justify-center rounded-lg border border-border bg-background p-4 text-center text-sm text-muted-foreground">
      {t("embedUnavailable")}
    </main>
  )
}
