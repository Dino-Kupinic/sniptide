import { cn } from "@workspace/ui/lib/utils"
import { getLanguage, markerClass } from "@/lib/pastes/languages"

export function LanguageMarker({ language, className }: { language: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("size-2 shrink-0", markerClass[getLanguage(language).marker], className)}
    />
  )
}

export function LanguageLabel({ language, className }: { language: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LanguageMarker language={language} />
      {getLanguage(language).name}
    </span>
  )
}
