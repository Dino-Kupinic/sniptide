import { BookOpenIcon, ClipboardListIcon, type LucideIcon, MegaphoneIcon } from "lucide-react"
import type { EmailKind } from "@/lib/kinds"

export const KIND_ICONS: Record<EmailKind, LucideIcon> = {
  update: MegaphoneIcon,
  survey: ClipboardListIcon,
  guide: BookOpenIcon,
}
