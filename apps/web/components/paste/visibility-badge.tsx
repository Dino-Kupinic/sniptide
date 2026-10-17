import { Badge } from "@sniptide/ui/components/badge"
import { useTranslations } from "next-intl"
import type { Paste } from "@/lib/pastes/types"

// Burn-after-read wins over visibility, as in the paste tables of the designs.
export function VisibilityBadge({ paste }: { paste: Pick<Paste, "visibility" | "burnAfterRead"> }) {
  const t = useTranslations("Paste")
  if (paste.burnAfterRead) return <Badge variant="primary">{t("burnAfterRead")}</Badge>
  if (paste.visibility === "public") return <Badge variant="solid">{t("public")}</Badge>
  if (paste.visibility === "private") return <Badge variant="muted">{t("private")}</Badge>
  return <Badge variant="outline">{t("unlisted")}</Badge>
}
